import React from "react";
import styles from "../styles/CardButton.module.css";

const CardButton = ({ card, onClick, disabled, playable }) => {
  if (!card) return null;

  const { color, value } = card;

  // --- UNO color palette ---
  const colorMap = {
    red: "#e74c3c",
    green: "#27ae60",
    blue: "#3498db",
    yellow: "#f1c40f",
    black: "#2c3e50",
    wild: "#2c3e50",
  };

  const bgColor = colorMap[color?.toLowerCase()] || "#ccc";
  const textColor = color?.toLowerCase() === "yellow" ? "#333" : "#fff";

  const isWild = ["wild", "wilddrawfour", "wild draw four"].includes(
    value.toLowerCase()
  );

  return (
    <button
      className={`${styles.cardButton} ${
        playable && !disabled ? styles.playable : ""
      }`}
      onClick={onClick}
      disabled={disabled}
      style={{
        backgroundColor: isWild ? "#2c3e50" : bgColor,
        color: textColor,
        borderRadius: "12px",
        padding: "20px 14px",
        minWidth: "70px",
        minHeight: "100px",
        fontSize: isWild ? "1rem" : "1.6rem",
        fontWeight: "bold",
        border: `2px solid ${textColor}55`,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "transform 0.2s, box-shadow 0.2s",
        boxShadow: disabled
          ? "none"
          : playable
          ? `0 0 16px 6px ${bgColor}aa`
          : `0 4px 8px ${bgColor}55`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
      }}
      onMouseEnter={(e) => {
        if (playable && !disabled) {
          e.currentTarget.style.transform = "translateY(-6px) scale(1.1)";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "scale(1)";
      }}
    >
      {isWild ? (
        <div
          style={{
            width: "60%",
            height: "60%",
            borderRadius: "50%",
            overflow: "hidden",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gridTemplateRows: "1fr 1fr",
          }}
        >
          <div style={{ background: "#e74c3c" }}></div>
          <div style={{ background: "#27ae60" }}></div>
          <div style={{ background: "#3498db" }}></div>
          <div style={{ background: "#f1c40f" }}></div>
        </div>
      ) : (
        String(value).toUpperCase()
      )}
    </button>
  );
};

export default CardButton;
