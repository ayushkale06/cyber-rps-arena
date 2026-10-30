from src.arena_logic import evaluate_duel, format_battle_summary

def handle_round_request(payload: dict):
    move = payload.get('move')
    result = evaluate_duel(move, ai_move=payload.get('bot_move'))
    summary = format_battle_summary(result)
    return {'result': result, 'summary': summary}
