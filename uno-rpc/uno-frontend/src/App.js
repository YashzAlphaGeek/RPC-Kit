import React, { useState } from "react";
import JoinGame from "./components/JoinGame";
import Lobby from "./components/Lobby";
import GameBoard from "./pages/GameBoard";

function App() {
  const [gameInfo, setGameInfo] = useState(null);
  const [gameStarted, setGameStarted] = useState(false);

  return (
    <>
      {!gameInfo ? (
        <JoinGame
          onJoined={(resp, playerNameInput) => {
            console.log("[App] onJoined called with:", resp, playerNameInput);

            setGameInfo({
              gameId: resp.gameId,
              playerId: resp.playerId,
              playerName: playerNameInput,
              allPlayers: resp.allPlayers || [], // initial list from server
            });
          }}
        />

      ) : !gameStarted ? (
        <Lobby
          gameId={gameInfo.gameId}
          playerId={gameInfo.playerId}        // ✅ server ID
          playerName={gameInfo.playerName}
          onStartGame={() => setGameStarted(true)}
          initialPlayers={gameInfo.allPlayers}
        />
      ) : (
        <GameBoard
          gameId={gameInfo.gameId}
          playerId={gameInfo.playerId}
          playerName={gameInfo.playerName}
        />
      )}
    </>
  );
}

export default App;
