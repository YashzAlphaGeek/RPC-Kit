package com.unogame.uno_backend.grpc;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;

import com.google.protobuf.InvalidProtocolBufferException;
import com.google.protobuf.util.JsonFormat;
import com.unogame.uno_backend.model.Card;
import com.unogame.uno_backend.model.GameSession.PlayResult;
import com.unogame.uno_backend.model.Player;
import com.unogame.uno_backend.service.GameService;
import com.unogame.uno_backend.service.GameService.JoinResponse;
import com.unogame.uno_backend.service.GameService.PlayerInfo;
import com.unogame.uno_backend.service.UserService;

import io.grpc.Status;
import io.grpc.stub.StreamObserver;
import net.devh.boot.grpc.server.service.GrpcService;

@GrpcService
public class UnoServiceImpl extends UnoServiceGrpc.UnoServiceImplBase {

    private static final Logger logger = LoggerFactory.getLogger(UnoServiceImpl.class);

    private final GameService gameService;
    private final UserService userService;
    private final Map<String, List<StreamObserver<GameStateResponse>>> gameStateObservers = new ConcurrentHashMap<>();

    @Autowired
    public UnoServiceImpl(GameService gameService, UserService userService) {
        this.gameService = gameService;
        this.userService = userService;
    }

    @Override
    public void joinGame(JoinRequest request,
            StreamObserver<com.unogame.uno_backend.grpc.JoinResponse> responseObserver) {
        List<String> playerNames = request.getPlayerNamesList();
        if (playerNames.isEmpty()) {
            responseObserver.onError(Status.INVALID_ARGUMENT
                    .withDescription("At least one player name must be provided")
                    .asRuntimeException());
            return;
        }

        String gameId;
        boolean newGame = false;

        if (request.getGameId() == null || request.getGameId().isEmpty()) {
            Player firstPlayer = userService.registerUser(playerNames.get(0));
            gameId = gameService.createGame(firstPlayer);
            newGame = true;
        } else {
            gameId = request.getGameId();
        }

        List<Player> playersToJoin = playerNames.stream()
                .map(userService::registerUser)
                .toList();

        JoinResponse serviceResponse = gameService.joinPlayers(gameId, playersToJoin);

        // Convert service DTOs to gRPC DTOs
        List<com.unogame.uno_backend.grpc.PlayerInfo> allPlayersGrpc = serviceResponse.allPlayers().stream()
                .map(p -> com.unogame.uno_backend.grpc.PlayerInfo.newBuilder()
                        .setId(p.id())
                        .setName(p.name())
                        .build())
                .collect(Collectors.toList());

        List<com.unogame.uno_backend.grpc.PlayerInfo> newPlayersGrpc = serviceResponse.newPlayers().stream()
                .map(p -> com.unogame.uno_backend.grpc.PlayerInfo.newBuilder()
                        .setId(p.id())
                        .setName(p.name())
                        .build())
                .collect(Collectors.toList());

        com.unogame.uno_backend.grpc.JoinResponse grpcResponse = com.unogame.uno_backend.grpc.JoinResponse.newBuilder()
                .setGameId(gameId)
                .setMessage(newGame ? "Game created and players joined" : "Players joined successfully")
                .addAllAllPlayerIds(allPlayersGrpc)
                .addAllNewPlayerIds(newPlayersGrpc)
                .build();

        responseObserver.onNext(grpcResponse);
        responseObserver.onCompleted();

        logger.info("Players {} joined game {}", playerNames, gameId);

        broadcastGameState(gameId, PlayStatus.OK, true);
    }

    @Override
    public void startGame(StartGameRequest request, StreamObserver<StartGameResponse> responseObserver) {
        // Deal hands and start game
        gameService.startGame(request.getGameId());

        StartGameResponse resp = StartGameResponse.newBuilder()
                .setMessage("Game started and hands dealt")
                .build();
        responseObserver.onNext(resp);
        responseObserver.onCompleted();

        // Broadcast full game state with hands
        broadcastGameState(request.getGameId(), PlayStatus.OK, true);
    }

    @Override
    public StreamObserver<PlayRequest> playCard(StreamObserver<PlayResponse> responseObserver) {
        return new StreamObserver<>() {
            @Override
            public void onNext(PlayRequest request) {
                if (request.getGameId().isEmpty() || request.getPlayerId().isEmpty() || request.getCard() == null) {
                    responseObserver.onError(Status.INVALID_ARGUMENT
                            .withDescription("Game ID, Player ID, and Card must be provided")
                            .asRuntimeException());
                    return;
                }

                Card card = new Card(request.getCard().getColor(), request.getCard().getValue());
                PlayResult result = gameService.playCard(request.getGameId(), request.getPlayerId(), card);
                PlayStatus status = mapStatus(result.getStatus());

                PlayResponse response = PlayResponse.newBuilder()
                        .setMessage(request.getPlayerId() + " played " + card.getColor() + ":" + card.getValue())
                        .setNextPlayerId(result.getNextPlayerId() != null ? result.getNextPlayerId() : "")
                        .setStatus(status)
                        .build();

                responseObserver.onNext(response);
                broadcastGameState(request.getGameId(), status, true);
            }

            @Override
            public void onError(Throwable t) {
                logger.error("Error in playCard stream", t);
            }

            @Override
            public void onCompleted() {
                responseObserver.onCompleted();
            }
        };
    }

    @Override
    public void gameState(GameStateRequest request, StreamObserver<GameStateResponse> responseObserver) {
        String gameId = request.getGameId();

        List<StreamObserver<GameStateResponse>> observers = gameStateObservers.computeIfAbsent(gameId,
                k -> new CopyOnWriteArrayList<>());
        observers.add(responseObserver);

        sendGameStateToObserver(gameId, responseObserver, PlayStatus.OK, gameService.isGameStarted(gameId));
    }

    private void sendGameStateToObserver(String gameId, StreamObserver<GameStateResponse> observer,
            PlayStatus lastMoveStatus, boolean gameStarted) {
        List<PlayerInfo> players = gameService.getPlayersInGame(gameId);
        List<Card> tableCards = gameService.getCardsOnTable(gameId);
        String currentPlayer = gameService.getCurrentPlayerId(gameId);

        // Include hands only after startGame
        List<com.unogame.uno_backend.grpc.PlayerInfo> playersGrpc = players.stream()
                .map(p -> {
                    List<Card> hand = gameService.getPlayerHand(gameId, p.id());
                    List<com.unogame.uno_backend.grpc.Card> handGrpc = hand.stream()
                            .map(Card::toDTO)
                            .map(dto -> com.unogame.uno_backend.grpc.Card.newBuilder()
                                    .setColor(dto.color())
                                    .setValue(dto.value())
                                    .build())
                            .collect(Collectors.toList());

                    return com.unogame.uno_backend.grpc.PlayerInfo.newBuilder()
                            .setId(p.id())
                            .setName(p.name())
                            .addAllHand(handGrpc)
                            .build();
                }).collect(Collectors.toList());

        List<com.unogame.uno_backend.grpc.Card> cardsGrpc = tableCards.stream()
                .map(Card::toDTO)
                .map(dto -> com.unogame.uno_backend.grpc.Card.newBuilder()
                        .setColor(dto.color())
                        .setValue(dto.value())
                        .build())
                .collect(Collectors.toList());

        GameStateResponse response = GameStateResponse.newBuilder()
                .setGameId(gameId)
                .addAllPlayers(playersGrpc)
                .addAllCardsOnTable(cardsGrpc)
                .setCurrentPlayerId(currentPlayer != null ? currentPlayer : "")
                .setLastMoveStatus(lastMoveStatus)
                .setGameStarted(gameStarted) // ⚡ new flag
                .build();

        observer.onNext(response);
        logger.info("GameState JSON: {}", toJson(response));
    }

    private void broadcastGameState(String gameId, PlayStatus lastMoveStatus, boolean gameStarted) {
        List<StreamObserver<GameStateResponse>> observers = gameStateObservers.computeIfAbsent(gameId,
                k -> new CopyOnWriteArrayList<>());

        observers.removeIf(observer -> {
            try {
                sendGameStateToObserver(gameId, observer, lastMoveStatus, gameStarted);
                return false;
            } catch (Exception e) {
                logger.warn("Removing closed observer for game {}", gameId, e);
                return true;
            }
        });
    }

    private PlayStatus mapStatus(PlayResult.Status status) {
        return switch (status) {
            case OK -> PlayStatus.OK;
            case INVALID_TURN -> PlayStatus.INVALID_TURN;
            case INVALID_PLAYER -> PlayStatus.INVALID_PLAYER;
            default -> PlayStatus.GAME_NOT_FOUND;
        };
    }

    public static String toJson(GameStateResponse response) {
        try {
            return JsonFormat.printer()
                    .includingDefaultValueFields()
                    .preservingProtoFieldNames()
                    .print(response);
        } catch (InvalidProtocolBufferException e) {
            return "{\"error\":\"Failed to convert to JSON\"}";
        }
    }
}
