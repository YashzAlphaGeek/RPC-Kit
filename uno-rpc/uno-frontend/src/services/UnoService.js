import { UnoServiceClient } from "../grpc/uno_grpc_web_pb";
import {
  JoinRequest,
  StartGameRequest,
  PlayRequest,
  GameStateRequest,
  Card as ProtoCard,
} from "../grpc/uno_pb";

export const client = new UnoServiceClient("/");

// --- Unique player ID per browser tab ---
export const getPlayerId = () => {
  const existingId = sessionStorage.getItem("playerId");
  if (existingId) return existingId;

  const newId = crypto.randomUUID();
  sessionStorage.setItem("playerId", newId);
  return newId;
};

// --- Normalize cards ---
export const normalizeCards = (cards = [], prefix = "card") =>
  cards.map((c, i) => ({
    uid: `${prefix}_${i}_${Date.now()}`,
    color: c.getColor ? c.getColor() : c.color || "black",
    value: c.getValue ? c.getValue() : c.value || "0",
  }));

// --- Normalize players ---
export const normalizePlayers = (protoPlayers = [], prefix = "p") =>
  protoPlayers.map((p, i) => ({
    id: p.getId ? p.getId() : p.id,
    name: p.getName ? p.getName() : p.name,
    cards: normalizeCards(
      p.getHandList ? p.getHandList() : p.hand || [],
      `${prefix}${i}`
    ),
  }));

// --- Join a game ---
export const joinGame = (playerNames, gameId) => {
  const req = new JoinRequest();
  req.setPlayernamesList(playerNames);
  if (gameId) req.setGameid(gameId);

  // Assign per-tab unique player ID
  const playerId = getPlayerId();
  req.setPlayerid?.(playerId);

  return new Promise((resolve, reject) => {
    client.joinGame(req, {}, (err, resp) => {
      if (err) return reject(err);

      const allPlayersList = resp.getAllplayeridsList
        ? resp.getAllplayeridsList()
        : resp.allPlayerIds || [];

      const newPlayersList = resp.getNewplayeridsList
        ? resp.getNewplayeridsList()
        : resp.newPlayerIds || [];

      resolve({
        message: resp.getMessage ? resp.getMessage() : resp.message,
        gameId: resp.getGameid ? resp.getGameid() : resp.gameId,
        allPlayers: normalizePlayers(allPlayersList, "all_"),
        newPlayers: normalizePlayers(newPlayersList, "new_"),
        playerId, // Return the current tab's player ID
      });
    });
  });
};

// --- Start game ---
export const startGame = (gameId) => {
  const req = new StartGameRequest();
  req.setGameid(gameId);

  return new Promise((resolve, reject) => {
    client.startGame(req, {}, (err, resp) => {
      if (err) return reject(err);
      resolve({ message: resp.getMessage ? resp.getMessage() : resp.message });
    });
  });
};

// --- Play a card ---
export const playCard = (gameId, playerId, card) => {
  const req = new PlayRequest();
  req.setGameid(gameId);
  req.setPlayerid(playerId);

  const protoCard = new ProtoCard();
  protoCard.setColor(card.color);
  protoCard.setValue(card.value);
  req.setCard(protoCard);

  return new Promise((resolve, reject) => {
    const stream = client.playCard();

    stream.on("data", (resp) => {
      resolve(resp.toObject ? resp.toObject() : resp);
      stream.end();
    });

    stream.on("error", (err) => reject(err));

    stream.write(req);
  });
};

// --- Subscribe to game state ---
export const subscribeGameState = (gameId, onData, onError, onEnd) => {
  const req = new GameStateRequest();
  req.setGameid(gameId);

  const stream = client.gameState(req, {});

  stream.on("data", (resp) => {
    const protoPlayers = resp.getPlayersList?.() || resp.players || [];
    const players = protoPlayers.map((p, i) => {
      const handList = p.getHandList?.() || p.hand || [];
      const cards = handList.map((c, j) => ({
        uid: `p${i}_card${j}_${Date.now()}`,
        color: c.getColor?.() || c.color || "black",
        value: c.getValue?.() || c.value || "0",
      }));

      return {
        id: p.getId?.() || p.id,
        name: p.getName?.() || p.name,
        cards,
      };
    });

    const protoCards = resp.getCardsontableList?.() || resp.cardsOnTable || [];
    const cardsOnTable = protoCards.map((c, i) => ({
      uid: `table_${i}_${Date.now()}`,
      color: c.getColor?.() || c.color || "black",
      value: c.getValue?.() || c.value || "0",
    }));

    const currentPlayerId = resp.getCurrentPlayerId?.() || resp.currentPlayerId;
    const lastMoveInfo = resp.getLastMoveInfo?.() || resp.lastMoveInfo;

    onData({ players, cardsOnTable, currentPlayerId, lastMoveInfo });
  });

  stream.on("error", (err) => onError?.(err));
  stream.on("end", () => onEnd?.());

  return stream;
};
