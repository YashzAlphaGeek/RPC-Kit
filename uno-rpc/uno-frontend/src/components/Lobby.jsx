import React, { useEffect, useState } from "react";
import { subscribeGameState, startGame, normalizePlayers } from "../services/UnoService";
import styles from "../styles/Lobby.module.css";

const Lobby = ({ gameId, playerId, playerName, onStartGame }) => {
  const [players, setPlayers] = useState([]);
  const [joinedPlayers, setJoinedPlayers] = useState([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!gameId) return;

    const stream = subscribeGameState(
      gameId,
      (data) => {
        // --- Normalize players ---
        const normalized = normalizePlayers(data.players || []);
        setPlayers(normalized);

        // --- Track newly joined players for animation ---
        setJoinedPlayers((prev) => {
          const prevIds = prev.map((p) => p.id);
          const newlyJoined = normalized.filter((p) => !prevIds.includes(p.id));
          return [...prev, ...newlyJoined];
        });

        // --- Redirect all players when gameStarted === true ---
        if (data.gameStarted) {
          onStartGame();
        }
      },
      (err) => console.error("Lobby stream error:", err),
      () => console.log("Lobby stream ended")
    );

    return () => stream?.cancel?.();
  }, [gameId, onStartGame]);

  const copyGameId = () => {
    navigator.clipboard.writeText(gameId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleStartGame = async () => {
    try {
      await startGame(gameId);
      console.log("Start game request sent to server");
      // Do NOT call onStartGame() here; wait for the broadcast
    } catch (err) {
      console.error("Failed to start game:", err);
    }
  };

  return (
    <div className={styles.lobbyWrapper}>
      <h2>Game Lobby</h2>
      <p>
        <strong>Game ID:</strong> {gameId}{" "}
        <button className={styles.copyButton} onClick={copyGameId}>📋</button>
        {copied && <span className={styles.copiedText}>Copied!</span>}
      </p>
      <p>Waiting for players to join...</p>

      <div className={styles.playersGrid}>
        {players.map((p) => (
          <div
            key={p.id}
            className={`${styles.playerCard} ${p.id === playerId ? styles.you : ""} ${
              joinedPlayers.find((jp) => jp.id === p.id) ? styles.joinAnimation : ""
            }`}
          >
            <div className={styles.avatar}>{p.name.charAt(0).toUpperCase()}</div>
            <div className={styles.playerName}>{p.name}</div>
          </div>
        ))}
      </div>

      <div className={styles.centerInfo}>
        <p>Players joined: {players.length}</p>
      </div>

      <button
        className={styles.startButton}
        onClick={handleStartGame}
        disabled={players.length < 2}
      >
        {players.length < 2 ? "Waiting for players..." : "Start Game"}
      </button>
    </div>
  );
};

export default Lobby;
