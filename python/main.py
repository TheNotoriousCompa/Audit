"""
YouTube to MP3 Converter - Main Entry Point

This module serves as the main entry point for the YouTube to MP3 converter application.
It handles command-line argument parsing, input validation, and coordinates the download
and conversion process between different components of the application.

Key Responsibilities:
- Parse command line arguments and configuration
- Set up logging and progress reporting
- Coordinate between the downloader and interface components
- Handle both single URL and batch processing
- Manage error handling and user feedback

Dependencies:
- downloader.core: Core downloading functionality
- interface.ipc: Inter-process communication handling
- interface.log: Logging configuration and progress reporting
"""
import sys
import logging
import os
from pathlib import Path
from typing import Dict, Any, Optional, Tuple, List, Union

# Add the current directory to the path so we can import local modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import local modules
from interface.ipc import IPC
from interface.log import setup_logging, ProgressReporter
from downloader.core import download_media

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

def main() -> None:
    """Main entry point for the YouTube to MP3 converter."""
    # Initialize IPC
    ipc_handler = IPC()
    
    try:
        # Read input (from command line or Electron)
        args = ipc_handler.read_input()
        
        # Set up logging
        log_level = args.get('log_level', 'INFO')
        log_file = args.get('log_file')
        setup_logging(log_file=log_file, level=log_level)
        
        # Set up progress reporter
        progress_reporter = ipc_handler.setup_progress_callback()
    
        if 'url' in args and args['url']:
            # Single URL download
            success, output_path, message = process_single_url(
                url=args['url'],
                output_dir=args.get('output_folder', '.'),
                bitrate=args.get('bitrate', 320),
                format=args.get('format', 'mp3'),
                process_playlist=args.get('process_playlist', False),
                progress_callback=progress_reporter,
                max_retries=args.get('max_retries', 3),
                timeout=args.get('timeout', 300)
            )
            
            # Send result
            ipc_handler.send_result(success, message, str(output_path) if output_path else None)
            
        elif 'batch_file' in args and args['batch_file']:
            # Batch processing
            success, message = process_batch_file(
                batch_file=args['batch_file'],
                output_dir=args.get('output_folder', '.'),
                bitrate=args.get('bitrate', 320),
                process_playlist=args.get('process_playlist', False),
                progress_callback=progress_reporter,
                max_retries=args.get('max_retries', 3),
                timeout=args.get('timeout', 300)
            )
            
            # Send result
            ipc_handler.send_result(success, message)
            
        else:
            # No valid input
            ipc_handler.send_result(False, "No URL or batch file provided")
            
    except Exception as e:
        logger.exception("An error occurred")
        ipc_handler.send_result(False, f"An error occurred: {str(e)}")
        sys.exit(1)

def process_single_url(
    url: str,
    output_dir: str,
    bitrate: int = 320,
    format: str = 'mp3',
    process_playlist: bool = False,
    progress_callback: Optional[ProgressReporter] = None,
    max_retries: int = 3,
    timeout: int = 300
) -> Tuple[bool, Optional[Path], str]:
    """Process a single URL."""
    try:
        return download_media(
            url=url,
            output_dir=output_dir,
            bitrate=bitrate,
            format=format,
            process_playlist=process_playlist,
            progress_callback=progress_callback,
            max_retries=max_retries,
            timeout=timeout
        )
    except Exception as e:
        logger.exception(f"Error processing URL {url}")
        return False, None, f"Error: {str(e)}"

def process_batch_file(
    batch_file: str,
    output_dir: str,
    bitrate: int = 320,
    format: str = 'mp3',
    process_playlist: bool = False,
    progress_callback: Optional[ProgressReporter] = None,
    max_retries: int = 3,
    timeout: int = 300
) -> Tuple[bool, Optional[Path], str]:
    """Process a batch file containing multiple URLs."""
    try:
        with open(batch_file, 'r', encoding='utf-8') as f:
            urls = [line.strip() for line in f if line.strip() and not line.startswith('#')]
        
        if not urls:
            return False, None, "No valid URLs found in batch file"
        
        success_count = 0
        output_path = None
        for url in urls:
            try:
                success, output_path, message = process_single_url(
                    url=url,
                    output_dir=output_dir,
                    bitrate=bitrate,
                    format=format,
                    process_playlist=process_playlist,
                    progress_callback=progress_callback,
                    max_retries=max_retries,
                    timeout=timeout
                )
                
                if success:
                    success_count += 1
                
                logger.info(f"Processed {url}: {message}")
                
            except Exception as e:
                logger.error(f"Error processing {url}: {str(e)}")
        
        return True, f"Processed {success_count}/{len(urls)} URLs successfully"
        
    except Exception as e:
        logger.exception("Error processing batch file")
        return False, f"Error processing batch file: {str(e)}"

if __name__ == "__main__":
    main()
