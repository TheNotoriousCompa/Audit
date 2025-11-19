"""
Command line argument parsing for the YouTube to MP3 downloader.

This module handles the parsing of command line arguments and JSON input from the Electron frontend.
It provides a unified interface for both CLI and GUI modes, ensuring consistent behavior
regardless of how the application is invoked.

Key Features:
- Parse command line arguments for both single and batch downloads
- Handle JSON input from the Electron frontend
- Validate and normalize input parameters
- Generate help text and usage information
- Format results for display in the frontend

Dependencies:
- argparse: For command line argument parsing
- json: For handling JSON input/output
- pathlib: For path manipulation
- typing: For type hints
- config.py: For default configuration values
"""
import argparse
import json
import sys
from pathlib import Path
from typing import Dict, Any, Optional, List, Union

try:
    # For when running as a module
    from downloader import config
except ImportError:
    # For direct script execution
    from ..downloader import config

def parse_arguments(args: Optional[List[str]] = None) -> Dict[str, Any]:
    """
    Parse command line arguments.
    
    Args:
        args: List of command line arguments. If None, uses sys.argv[1:].
        
    Returns:
        Dictionary of parsed arguments.
    """
    parser = argparse.ArgumentParser(description="YouTube to MP3 Converter")
    
    # Required arguments
    parser.add_argument(
        "url",
        nargs="?",
        help="YouTube video URL or search query"
    )
    
    # Optional arguments
    parser.add_argument(
        "output_folder",
        nargs="?",
        default=str(config.DEFAULT_OUTPUT_DIR),
        help=f"Output folder (default: {config.DEFAULT_OUTPUT_DIR})"
    )
    
    parser.add_argument(
        "--bitrate",
        type=int,
        default=config.DEFAULT_BITRATE,
        help=f"Audio bitrate in kbps (default: {config.DEFAULT_BITRATE})"
    )
    
    parser.add_argument(
        "--format",
        type=str,
        default='mp3',
        choices=['mp3', 'm4a', 'flac', 'wav', 'opus', 'best'],
        help="Output format (default: mp3)"
    )
    
    parser.add_argument(
        "--batch",
        type=str,
        help="Path to CSV or TXT file for batch download (one URL or search query per line)"
    )
    
    parser.add_argument(
        "--process-playlist",
        action="store_true",
        help="Process all videos in the playlist"
    )
    
    parser.add_argument(
        "--timeout",
        type=int,
        default=config.DEFAULT_TIMEOUT,
        help=f"Timeout in seconds for each download (default: {config.DEFAULT_TIMEOUT})"
    )
    
    parser.add_argument(
        "--max-retries",
        type=int,
        default=config.DEFAULT_MAX_RETRIES,
        help=f"Maximum number of retry attempts (default: {config.DEFAULT_MAX_RETRIES})"
    )
    
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"],
        help="Set the logging level (default: INFO)"
    )
    
    parser.add_argument(
        "--log-file",
        help="Path to log file (default: None, logs to console only)"
    )
    
    # Parse arguments
    parsed_args = parser.parse_args(args)
    
    # Convert to dictionary and add any additional processing
    args_dict = {
        'url': parsed_args.url,
        'output_folder': Path(parsed_args.output_folder).resolve(),
        'bitrate': parsed_args.bitrate,
        'format': parsed_args.format,
        'batch_file': Path(parsed_args.batch) if parsed_args.batch else None,
        'process_playlist': parsed_args.process_playlist,
        'timeout': parsed_args.timeout,
        'max_retries': parsed_args.max_retries,
        'log_level': parsed_args.log_level,
        'log_file': parsed_args.log_file
    }
    
    return args_dict

def parse_json_input(json_input: str) -> Dict[str, Any]:
    """
    Parse JSON input from Electron frontend.
    
    Args:
        json_input: JSON string from Electron
        
    Returns:
        Dictionary of parsed arguments
    """
    try:
        data = json.loads(json_input)
        
        # Convert to the same format as CLI args
        return {
            'url': data.get('url'),
            'output_folder': Path(data.get('output_folder', str(config.DEFAULT_OUTPUT_DIR))).resolve(),
            'bitrate': int(data.get('bitrate', config.DEFAULT_BITRATE)),
            'process_playlist': bool(data.get('process_playlist', False)),
            'timeout': int(data.get('timeout', config.DEFAULT_TIMEOUT)),
            'max_retries': int(data.get('max_retries', config.DEFAULT_MAX_RETRIES)),
            'log_level': data.get('log_level', 'INFO'),
            'log_file': data.get('log_file')
        }
    except (json.JSONDecodeError, ValueError) as e:
        raise ValueError(f"Invalid JSON input: {str(e)}")

def format_result(success: bool, message: str, output_path: Optional[Union[str, Path]] = None) -> str:
    """
    Format the result as JSON for the frontend.
    
    Args:
        success: Whether the operation was successful
        message: Result message
        output_path: Path to the downloaded file(s)
        
    Returns:
        JSON string with the result
    """
    result = {
        'success': success,
        'message': message,
        'output_path': str(output_path) if output_path else None
    }
    return json.dumps(result)