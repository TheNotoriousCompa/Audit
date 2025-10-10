"""
Inter-process communication with Electron frontend.

This module handles all communication between the Python backend and the Electron frontend.
It manages message passing, progress reporting, and result formatting for both command-line
and Electron environments.

Key Features:
- Bidirectional communication with Electron renderer process
- Progress reporting during downloads
- Error handling and result formatting
- Support for both CLI and GUI modes
- JSON-based message passing

Dependencies:
- json: For message serialization
- logging: For error and debug logging
- sys: For stdin/stdout communication
- typing: For type hints
"""
import sys
import json
import logging
from typing import Dict, Any, Optional, Callable

from .log import ProgressReporter, format_progress

logger = logging.getLogger(__name__)

class IPC:
    """Handles communication with the Electron frontend."""
    
    def __init__(self):
        self.progress_callback = None
        self.is_electron = hasattr(sys, 'executable') and 'electron' in sys.executable.lower()
    
    def setup_progress_callback(self, callback: Optional[Callable] = None) -> ProgressReporter:
        """Set up progress reporting."""
        if callback is None:
            callback = self._default_progress_handler
        
        self.progress_callback = callback
        return ProgressReporter(callback)
    
    def _default_progress_handler(self, data: Dict[str, Any]) -> None:
        """Default progress handler that prints to stdout."""
        try:
            # Ensure all data is JSON serializable
            progress_data = format_progress(data)
            message = json.dumps({
                'type': 'progress',
                'data': progress_data
            })
            
            # Always write progress to stdout in Electron mode
            if self.is_electron:
                print(message, flush=True)
                
            # For CLI mode or debugging, also log to stderr
            import sys
            if not self.is_electron or True:  # Always log for now
                status = progress_data.get('status', 'unknown')
                percentage = progress_data.get('percentage', 0)
                if status == 'error':
                    print(f"[ERROR] {progress_data.get('message', 'Unknown error')}", file=sys.stderr)
                elif status in ['downloading', 'converting', 'finished']:
                    print(f"[PROGRESS] {status} - {percentage}%")
                    if 'message' in progress_data and progress_data['message']:
                        print(f"[INFO] {progress_data['message']}")
                
        except Exception as e:
            error_message = json.dumps({
                'type': 'error',
                'message': f'Error formatting progress: {str(e)}'
            })
            print(error_message, file=sys.stderr, flush=True)
    
    def send_result(self, success: bool, message: str = None, output_path: str = None, error: str = None, **kwargs):
        """
        Send a result message to the frontend.
        
        Args:
            success: Whether the operation was successful
            message: Optional success/status message
            output_path: Path to the downloaded file(s)
            error: Error message if the operation failed
            **kwargs: Additional result data
        """
        result = {
            'type': 'result',
            'data': {
                'success': success,
                'message': message,
                'output_path': output_path,
                'error': error,
                **kwargs
            }
        }
        # Ensure we only print valid JSON to stdout
        print(json.dumps(result), flush=True)
    
    def read_input(self):
        """Read input from stdin (Electron) or command line."""
        if self.is_electron:
            while True:
                line = sys.stdin.readline().strip()
                # Skip any lines that don't start with { (likely log messages)
                if line.startswith('{'):
                    try:
                        # Try to parse as JSON to validate
                        json.loads(line)
                        return line
                    except json.JSONDecodeError:
                        continue
        else:
            # In CLI mode, parse command line arguments
            try:
                # For when running as a module
                from interface.args_parser import parse_arguments
            except ImportError:
                # For direct script execution
                from .args_parser import parse_arguments
            return parse_arguments()
    
    def handle_electron_messages(self, process_func: Callable) -> None:
        """Handle messages from Electron in a loop."""
        if not self.is_electron:
            return
            
        while True:
            try:
                # Read a line from stdin
                line = sys.stdin.readline()
                if not line:
                    break
                    
                # Parse the JSON message
                try:
                    message = json.loads(line)
                    message_type = message.get('type')
                    data = message.get('data', {})
                    
                    if message_type == 'download':
                        # Process the download
                        success, output_path, message = process_func(data)
                        self.send_result(success, message, str(output_path) if output_path else None)
                        
                except json.JSONDecodeError as e:
                    logger.error(f"Invalid message format: {e}")
                    self.send_result(False, f"Invalid message format: {e}")
                    
            except Exception as e:
                logger.exception("Error processing message")
                self.send_result(False, f"Error: {str(e)}")

# Global IPC instance
ipc = IPC()
