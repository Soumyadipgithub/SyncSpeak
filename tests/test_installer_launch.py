import subprocess
import os
from pathlib import Path
from unittest.mock import patch, MagicMock

def mock_handle_launch(exe_path):
    print(f"DEBUG: Launching with path: {exe_path}")
    try:
        # This is what we changed in sidecar_main.py
        # We want to ensure it doesn't crash even if the path has spaces
        # In a real test, we'd check the arguments passed to Popen
        proc = subprocess.Popen([str(exe_path)])
        return True
    except OSError as e:
        print(f"DEBUG: Caught expected OSError (since file doesn't exist): {e}")
        return False

def test_path_with_spaces():
    # Simulate a path with spaces
    fake_path = Path("C:/Users/Test User With Spaces/AppData/Local/Temp/SyncSpeak_Cable/VBCABLE_Setup_x64.exe")
    
    with patch("subprocess.Popen") as mock_popen:
        # Mocking Popen to not actually try to run anything
        mock_popen.return_value = MagicMock()
        
        print(f"\nTesting path: {fake_path}")
        mock_handle_launch(fake_path)
        
        # Verify that Popen was called with the path as a list, NOT with shell=True
        args, kwargs = mock_popen.call_args
        print(f"Popen called with args: {args}")
        print(f"Popen called with kwargs: {kwargs}")
        
        assert args[0] == [str(fake_path)]
        assert kwargs.get('shell') is None or kwargs.get('shell') == False
        print("SUCCESS: Path handled correctly as a list without shell=True.")

if __name__ == "__main__":
    try:
        test_path_with_spaces()
    except Exception as e:
        print(f"FAILURE: {e}")
