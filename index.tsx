import React, {useEffect, useState} from "react";
import {Peer, DataConnection} from "peerjs";
import {createRoot} from "react-dom/client";
import "./styles.scss";

interface NotificationPayload {
    type: string,
    [x: string]: any
}

interface OpponentData {
    mode: "ai" | "p2p";
    peerId?: string,
    remotePeerId?: string,
    connectionId?: string,
    lastRemotePeerId?: string,
    isRemotePeerFound?: boolean,
    isPeerSessionCreated?: boolean,
    isConnectionReliable?: boolean,
    isRemotePeerConnected?: boolean,
    isRemotePeerConnectionLost?: boolean,
}

const PLAYER_A_TOKEN = "O";
const PLAYER_B_TOKEN = "X";
const EMPTY = " ";
const NONE = "N";

function createPeerID() { return `jm-${(Math.random() * 10e6).toFixed()}`; }

function matchPatternMap(map: string[], token: string) {
    const patterns = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // ROWS
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // COLUMNS
        [0, 4, 8], [2, 4, 6]             // DIAGONALS
    ];

    return patterns.some(pattern => pattern.every(cell => map[cell] === token));
}

/** This hook will internally switch between an AI or P2P player opponent while
 * managing actions that are done by the AI/Player. */
function useAdaptativeOpponent(
    mode: OpponentData["mode"],
    board: string[],
    play: (cell: number) => void,
    makeOpponentFirstPlayer: () => void
) {
    const [hookData, setHookData] = useState<OpponentData>({mode: "ai"});
    const [peer, setPeer] = useState<Peer>();
    const [connection, setConnection] = useState<DataConnection>();

    /** Manages incoming/outgoing P2P connections and counters the effect of
     * a connected P2P client suddenly disconnecting. */
    useEffect(() => {
        setHookData(prev => ({...prev, mode}));

        if(mode === "ai") return reset();

        const localID = createPeerID();
        const localPeer = new Peer(localID);
        
        setHookData(prev => ({...prev, peerId: localID}));
        setPeer(localPeer);
        
        // Setup an active listener for incoming P2P connections.
        localPeer.on("connection", (conn) => {
            conn.on("open", () => {
                setHookData(prev => ({
                    ...prev,
                    isRemotePeerConnected: true,
                    isRemotePeerFound: true,
                    isConnectionReliable: conn.reliable,
                    connectionId: conn.connectionId,
                    remotePeerId: conn.peer
                }));
                makeOpponentFirstPlayer();
                setConnection(conn);
            });
            
            conn.on("data", processPayload as any);
        });

    }, [mode]);

    /** Computes the AI's next move. */
    function nextMove() {
        let nextIndex = -1;
        const empties = [...board].map((c, i) => [c, i])
            .filter(c => c[0] === EMPTY)
            .map(c => c[1]) as number[];

        empties.forEach(cell => {
            const tempBoard = [...board];
            tempBoard[cell] = PLAYER_B_TOKEN;

            if(matchPatternMap(tempBoard, PLAYER_B_TOKEN)) {
                nextIndex = cell;
            }
            if(matchPatternMap(tempBoard, PLAYER_A_TOKEN)) {
                nextIndex = cell;
            }
        });

        if(nextIndex === -1) 
            nextIndex = empties[parseInt(Math.random() * empties.length as any)]

        return nextIndex;
    }

    /** Processes any incoming payload, either local or from the P2P 
     * connection. */
    function processPayload(payload: NotificationPayload) {
        if(mode === "ai" && payload.type === "play") { 
            setTimeout(() => play(nextMove()), 100);
        }
        
        if(mode === "p2p" && payload.type === "play")
            play(payload.cell);
    }

    /** Send a payload either locally or to the remote P2P client. */
    function sendPayload(payload: NotificationPayload) {
        if(mode === "ai") processPayload(payload);
        else if(connection) connection.send(payload);
    }

    /** Connects to a peer using it's ID. */
    async function connectToPeer(id: string) {
        if(!peer) throw new Error("[connectPeer] Local peer not initialized");

        const conn = peer.connect(id);
        conn.on("open", () => {
            setHookData(prev => ({
                ...prev,
                isRemotePeerConnected: true,
                isRemotePeerFound: true,
                isConnectionReliable: conn.reliable,
                connectionId: conn.connectionId,
                remotePeerId: conn.peer
            }));
            setConnection(conn);
        });
            
        conn.on("data", processPayload as any);
    }

    /** Resets the whole opponent engine to defaults. */
    function reset() {
        setHookData(prev => ({
            mode: "ai",
            lastRemotePeerId: prev.remotePeerId
        }));
        connection?.close();
        peer?.destroy();
    }

    return [hookData, sendPayload, connectToPeer, reset] as const;
}

/** Generates a 2D virtual map of a specific size. Better solution over a raw
 * implementation of a map because no nested array is used. */
function useMap(size: [number, number]) {
    const cellnb = size[0] * size[1];
    const [mapState, setMapState] = useState(Array(cellnb).fill(EMPTY));

    function updateTokenAt(new_token: string, pos: number) {
        setMapState(prev => {
            prev[pos] = new_token;
            return prev;
        });
    }
    
    function resetMap() { setMapState(Array(cellnb).fill(EMPTY)); }

    return {mapState, updateTokenAt, resetMap};
}

/** Checks each time the board changes if a player won. */
function useWinningLookup(map: string[]) {
    const [winner, setWinner] = useState(EMPTY);
    const [stats, setStats] = useState({a: 0, b: 0});

    function resetWinner(withStats = false) {
        if(withStats) setStats({a: 0, b: 0});
        else setStats(prev => {
            prev[winner.toLowerCase()] += 1;
            return prev;
        });

        setWinner(EMPTY);
    }

    useEffect(() => {
        if (matchPatternMap(map, PLAYER_A_TOKEN)) setWinner("A");
        else if (matchPatternMap(map, PLAYER_B_TOKEN)) setWinner("B");
        else if (map.every(i => i !== EMPTY)) setWinner(NONE);
    }, [JSON.stringify(map)])

    return {winner, stats, resetWinner};
}

function Board() {
    const [mode, setMode] = useState<"ai" | "p2p">("ai");
    const [debug, setDebug] = useState(false);
    const [currentPlayer, setCurrentPlayer] = useState<"A" | "B">("A");
    const {mapState, updateTokenAt, resetMap} = useMap([3, 3]);
    const {winner, stats, resetWinner} = useWinningLookup(mapState);
    const [OConfig, ONotify, OConnect, OReset] = useAdaptativeOpponent(
        mode, mapState,
        (cell) => {
            updateTokenAt(PLAYER_B_TOKEN, cell);
            setCurrentPlayer("A");
        },
        () => setCurrentPlayer("B")
    );

    useEffect(() => {
        setTimeout(() => {
            if (winner !== EMPTY) {
                resetMap();
                resetWinner();
                if(mode === "ai") setCurrentPlayer("A");
            }
        }, 500);
    }, [winner]);

    useEffect(() => {
        if(mode === "ai") OReset();
        resetWinner(true);
    }, [mode]);

    useEffect(() => {
        (window as any).debug = (enable: boolean) => setDebug(enable);
    }, []);

    return <div id="container">
        <div id="board" 
            style={{
                "--x": 3,
                "--y": 3
            } as any}
        >
        {mapState.map((token, i) => (
            <div 
                key={i} 
                id="cell"
                data-has-token={token}
                data-has-winner={winner !== EMPTY}
                onClick={() => {
                    if(currentPlayer === "B") return;

                    updateTokenAt(PLAYER_A_TOKEN, i);
                    ONotify({type: "play", cell: i});
                    setCurrentPlayer("B");
                }}
            />
        ))}
        </div>
        <div id="current_role">
            <p>{currentPlayer === "A" ? "YOUR" : "OPPONENT'S"} TURN</p>
        </div>
        <br />
        <div id="stats">
            <div id="multiplayer">
                <div>
                    <input type="submit" 
                        value={mode === "ai" ? "Multiplayer" : "Single-player"} 
                        onClick={ev => {
                            ev.preventDefault();
                            setMode(prev => prev === "ai" ? "p2p" : "ai");
                        }} 
                    />
                    {mode === "p2p" ? <input type="submit"
                        value="Join session"
                        onClick={ev => {
                            ev.preventDefault();
                            const remoteID = prompt("Remote session ID");
                            OConnect("jm-" + remoteID as string);
                        }}
                    /> : null}
                </div>
                {mode === "p2p" ? OConfig.remotePeerId !== undefined ?
                    <p>THE OTHER PLAYER IS CONNECTED</p> : 
                    <p>YOUR CODE: {OConfig.peerId?.replace("jm-", "")}</p>
                : null}
            </div>
            <div id="leaderboard">
                <p>{stats.a}</p>
                <p>{stats.b}</p>
            </div>
            
        </div>
        {debug ? <div id="debug">
            <p>{stats.a} - {stats.b}</p>
            <p>has to play: {currentPlayer}</p>
            {Object.keys(OConfig).map(k => <p key={k}>{k}: {`${OConfig[k]}`}</p>)}
            <input type="submit" value="switch mode" onClick={ev => {
                ev.preventDefault();
                setMode(prev => prev === "ai" ? "p2p" : "ai");
            }} />
            <input type="submit" value="connect to peer" onClick={ev => {
                ev.preventDefault();
                
                const remoteID = prompt("Remote peer ID");
                OConnect(remoteID as string);
            }} />
        </div> : null}
    </div>
}

const root = createRoot(document.getElementById("app") as Element);
root.render(<Board />);

