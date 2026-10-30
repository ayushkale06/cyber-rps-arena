import random

VALID_MOVES = {'rock', 'paper', 'scissors'}

def evaluate_duel(player_move: str, ai_move: str = None) -> dict:
    """Evaluates a round of Cyber RPS with strict input validation."""
    p_move = (player_move or '').strip().lower()
    if p_move not in VALID_MOVES:
        raise ValueError(f'Invalid move "{player_move}". Must be rock, paper, or scissors.')

    bot_move = (ai_move or random.choice(list(VALID_MOVES))).lower()
    if bot_move not in VALID_MOVES:
        raise ValueError(f'Invalid AI move "{ai_move}".')

    if p_move == bot_move:
        outcome = 'tie'
    elif (p_move == 'rock' and bot_move == 'scissors') or \
         (p_move == 'paper' and bot_move == 'rock') or \
         (p_move == 'scissors' and bot_move == 'paper'):
        outcome = 'win'
    else:
        outcome = 'loss'

    return {
        'player_move': p_move,
        'ai_move': bot_move,
        'outcome': outcome,
        'status': 'round_complete'
    }

def format_battle_summary(result: dict) -> str:
    return f"{result['player_move'].upper()} vs {result['ai_move'].upper()} -> {result['outcome'].upper()}"
