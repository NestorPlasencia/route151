import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('save_progress', ROOT / 'scripts/frlg/save_progress.py')
progress = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(progress)


class SaveEvidenceTests(unittest.TestCase):
    def test_constants_resolve_hex_aliases_and_offsets_without_executing_expressions(self):
        text = '''#define HEADER_GUARD
#define FLAGS_START (BASE + 10)
#define BASE 0x500 // persistent
#define OTHER (FLAGS_START - 2)
#define BAD __import__('os').system('unexpected')
'''
        values = progress.constants(text)
        self.assertEqual(values['FLAGS_START'], 0x50A)
        self.assertEqual(values['OTHER'], 0x508)
        self.assertNotIn('BAD', values)

    def test_version_specific_scripts_keep_only_the_selected_branch(self):
        text = '''.ifdef FIRERED
trade::
 setflag FLAG_DID_MS_NIDO_TRADE
.else
trade::
 setflag FLAG_DID_NINA_TRADE
.endif'''
        red = progress.script_blocks(progress.version_text(text, 'FIRERED'))
        green = progress.script_blocks(progress.version_text(text, 'LEAFGREEN'))
        self.assertIn('MS_NIDO', red['trade'])
        self.assertNotIn('NINA', red['trade'])
        self.assertIn('NINA', green['trade'])

    def test_reachable_scripts_stop_cycles_and_do_not_cross_to_other_actors(self):
        scripts = {'Gym_EventScript_Start': ' goto Gym_EventScript_Battle',
                   'Gym_EventScript_Battle': ' trainerbattle_single TRAINER_LIAM\n goto Gym_EventScript_Start',
                   'Other_EventScript_Battle': ' trainerbattle_single TRAINER_OTHER'}
        body = progress.reachable(scripts, 'Gym_EventScript_Start')
        self.assertEqual(body.count('TRAINER_LIAM'), 1)
        self.assertNotIn('TRAINER_OTHER', body)


if __name__ == '__main__':
    unittest.main()
