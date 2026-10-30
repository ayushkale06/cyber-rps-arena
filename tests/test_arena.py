import unittest
from src.arena_logic import evaluate_duel
from src.arena_handler import handle_round_request

class TestCyberRpsArena(unittest.TestCase):
    def test_rock_beats_scissors(self):
        res = evaluate_duel('rock', 'scissors')
        self.assertEqual(res['outcome'], 'win')

    def test_tie_evaluation(self):
        res = evaluate_duel('paper', 'paper')
        self.assertEqual(res['outcome'], 'tie')

    def test_invalid_move_raises_value_error(self):
        with self.assertRaises(ValueError):
            evaluate_duel('laser_gun')

    def test_round_handler_integration(self):
        response = handle_round_request({'move': 'scissors', 'bot_move': 'paper'})
        self.assertEqual(response['result']['outcome'], 'win')
        self.assertIn('SCISSORS vs PAPER', response['summary'])

if __name__ == '__main__':
    unittest.main()
