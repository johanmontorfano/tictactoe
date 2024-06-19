import { EMPTY, PLAYER_A_TOKEN, PLAYER_B_TOKEN, matchPatternMap } from ".";

/** This is an implementation of the Minimax algorithm. The aim of this 
 * algorithm is to make the game's AI stronger. */
export function minimax(currentBoard: string[]) {
    function evaluate(board: string[]) {
        if (matchPatternMap(board, PLAYER_A_TOKEN)) {
            return 10;
        }
        else if (matchPatternMap(board, PLAYER_B_TOKEN)) {
            return -10;
        } 
        return 0;
    }

    function evaluateFromConfig(board: string[], depth: number, max: boolean): number {
        const score = evaluate(board);

        if (score !== 0) return score;
        if (depth === 0) return 0;
        
        let best = max ? -Infinity : Infinity;

        for (let i = 0; i < 9; i++) {
            if (board[i] === EMPTY) {
                board[i] = max ? PLAYER_A_TOKEN : PLAYER_B_TOKEN;
                best = (max ? Math.max : Math.min)(
                    best, 
                    evaluateFromConfig(board, depth + 1, !max)
                );
                board[i] = EMPTY;
            }
        }
        return best;
    }

    let bestVal = -Infinity;
    let bestMove = -1;

    for (let i = 0; i < 9; i++) {
        if (currentBoard[i] === EMPTY) {
            currentBoard[i] = PLAYER_A_TOKEN;
            let moveVal = evaluateFromConfig(currentBoard, 0, false);
            currentBoard[i] = EMPTY;

            if (moveVal > bestVal) {
                bestVal = moveVal;
                bestMove = i;
            }
        }
    }

    return bestMove;
}
