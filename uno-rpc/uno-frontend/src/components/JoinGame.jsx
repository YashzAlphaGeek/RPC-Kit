import React, { useState } from "react";
import styles from "../styles/JoinGame.module.css";
import { joinGame } from "../services/UnoService";

const JoinGame = ({ onJoined }) => {
  const [playerName, setPlayerName] = useState("");
  const [gameId, setGameId] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleJoin = async () => {
    const trimmedName = playerName.trim();
    const trimmedGameId = gameId.trim();

    if (!trimmedName) return setMessage("Please enter your name");

    setLoading(true);
    setMessage("");

    try {
      const resp = await joinGame([trimmedName], trimmedGameId || undefined);
      console.log("JoinGame response:", resp);

      onJoined(
        {
          gameId: resp.gameId,
          allPlayers: resp.allPlayers || [], // server-provided list
          newPlayers: resp.newPlayers || [],
          message: resp.message,
          playerId: resp.playerId,           // ✅ server ID
        },
        trimmedName
      );

      setMessage(resp.message);
    } catch (err) {
      console.error(err);
      setMessage(err?.message || "Failed to join game. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h2>Join UNO Game</h2>
        <input
          type="text"
          placeholder="Your Name"
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
        />
        <input
          type="text"
          placeholder="Game ID (optional)"
          value={gameId}
          onChange={(e) => setGameId(e.target.value)}
        />
        <button onClick={handleJoin} disabled={loading}>
          {loading ? "Joining..." : "Join Game"}
        </button>
        {message && <p className={styles.message}>{message}</p>}
      </div>
    </div>
  );
};

export default JoinGame;
