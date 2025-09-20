# test_whisper.py
import sys
import os
import json
from subprocess import run, PIPE

def test_whisper():
    # Path to your Python script
    script_path = os.path.join('src', 'app', 'api', 'transcribe', 'local', 'whisper_local.py')
    
    # Path to your test audio file
    audio_path = "/Users/stellaandorno/Desktop/20_Seconds_of_Courage.mp3"
    
    # Get Python path from environment or use default
    python_path = os.environ.get('PYTHON_PATH', '/Users/stellaandorno/.pyenv/versions/whisper_stepbystep/bin/python')
    
    # Run the command
    print(f"Running: {python_path} {script_path} {audio_path}")
    result = run([python_path, script_path, audio_path], stdout=PIPE, stderr=PIPE, text=True)
    
    # Print stderr (log messages)
    print("STDERR (log messages):")
    print(result.stderr)
    
    # Print stdout (result)
    print("\nSTDOUT (result):")
    print(result.stdout[:500] + "..." if len(result.stdout) > 500 else result.stdout)
    
    # Try to parse JSON
    try:
        json_data = json.loads(result.stdout)
        print("\nJSON parsed successfully!")
        print(f"Text length: {len(json_data.get('text', ''))}")
        print(f"Number of chunks: {len(json_data.get('chunks', []))}")
    except json.JSONDecodeError as e:
        print(f"\nJSON parse error: {e}")
        print("Raw output that failed to parse:")
        print(result.stdout)

if __name__ == "__main__":
    test_whisper()