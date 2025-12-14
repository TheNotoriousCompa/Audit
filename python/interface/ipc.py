"""Inter-process communication with Electron frontend."""
import sys
import json
import os
import logging
from typing import Any, Callable, Dict, Optional, Union

from .log import ProgressReporter, format_progress, setup_logging
from downloader.progress import ProgressCalculator

# Configure root logging once and get a module-specific logger
setup_logging()
logger = logging.getLogger(__name__)

class IPC:
    """Handles communication with the Electron frontend."""
    
    def __init__(self):
        self.progress_calculator = ProgressCalculator()
        # Detect if we're running under Electron
        self.is_electron = self._check_electron()

    def _check_electron(self) -> bool:
        """Return True if the process is running under Electron."""
        # Check if we're running under Electron by looking for ELECTRON_RUN_AS_NODE env var
        # or if parent process contains 'electron'
        return (
            os.environ.get('ELECTRON_RUN_AS_NODE') is not None or
            (hasattr(sys, 'executable') and 'electron' in str(sys.executable).lower())
        )
    
    def setup_progress_callback(self, callback: Optional[Callable] = None) -> ProgressReporter:
        """Set up progress reporting."""
        if callback is None:
            callback = self._default_progress_handler
        
        self.progress_callback = callback
        return ProgressReporter(callback)
    
    def _default_progress_handler(self, data: Dict[str, Any]) -> None:
        """Default progress handler that prints to stdout."""
        try:
            # Format progress data to match frontend interface
            progress_data = format_progress(data)
            
            # Create the message object
            message = {
                'type': 'progress',
                'data': progress_data
            }
            
            # Always write to stdout as single-line JSON for Electron
            # Prepend \n to ensure it's on a new line even if yt-dlp printed without newline
            print('\n' + json.dumps(message), flush=True)
            
            # Also log to stderr for debugging (won't interfere with JSON parsing)
            status = progress_data.get('status', 'unknown')
            percentage = progress_data.get('percentage', 0)
            
            if status == 'error':
                logger.error(f"[ERROR] {progress_data.get('message', 'Unknown error')}")
            elif status in ['downloading', 'converting', 'finished']:
                logger.info(f"[PROGRESS] {status} - {percentage}%")
                if progress_data.get('message'):
                    logger.info(f"[INFO] {progress_data['message']}")
                
        except Exception as e:
            error_message = {
                'type': 'error',
                'message': f'Error formatting progress: {str(e)}'
            }
            print(json.dumps(error_message), flush=True)
            logger.error(f"Progress handler error: {e}", exc_info=True)
    
    def send_result(self, success: bool, message: str = '', output_path: str = None, error: str = None) -> None:
        """Send a result back to the frontend."""
        if not self.is_electron:
            return
            
        result = {
            'type': 'result',
            'success': success,
            'message': message or '',
            'outputPath': output_path or '',
            'error': error or ''
        }
        print(json.dumps(result))
        sys.stdout.flush()
        
    def send_progress(self, progress_data: Dict[str, Any]) -> None:
        """Send progress update to the frontend.
        
        Args:
            progress_data: Dictionary containing progress information
        """
        if not self.is_electron:
            return
            
        message = {
            'type': 'progress',
            'data': progress_data
        }
        print(json.dumps(message))
        sys.stdout.flush()
    
    def read_input(self):
        """Read input from stdin (Electron) or command line."""
        if self.is_electron:
            while True:
                line = sys.stdin.readline().strip()
                if line.startswith('{'):
                    try:
                        json.loads(line)
                        return line
                    except json.JSONDecodeError:
                        continue
        else:
            try:
                from interface.args_parser import parse_arguments
            except ImportError:
                from .args_parser import parse_arguments
            return parse_arguments()
    
    def handle_electron_messages(self, process_func: Callable) -> None:
        """Handle messages from Electron in a loop."""
        if not self.is_electron:
            return
            
        while True:
            try:
                line = sys.stdin.readline()
                if not line:
                    break
                    
                try:
                    message = json.loads(line)
                    message_type = message.get('type')
                    data = message.get('data', {})
                    
                    if message_type == 'download':
                        # Handle download message
                        if data.get('reset_progress', False):
                            self.progress_calculator.reset_state()
                            
                        success, output_path, message = process_func(data)
                        self.send_result(success, message, str(output_path) if output_path else None)
                        
                    elif message_type == 'progress':
                        # Process progress update through the calculator
                        progress_data = self.progress_calculator.calculate_progress(data)
                        self.send_progress(progress_data)
                        
                except json.JSONDecodeError as e:
                    logger.error(f"Invalid message format: {e}")
                    self.send_result(False, error=f"Invalid message format: {e}")
                    
            except Exception as e:
                logger.exception("Error processing message")
                self.send_result(False, error=f"Error: {str(e)}")

# Global IPC instance
ipc = IPC()