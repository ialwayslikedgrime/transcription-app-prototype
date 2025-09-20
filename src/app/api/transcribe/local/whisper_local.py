#!/usr/bin/env python3
"""
Audio Transcription Script with Real-time Progress Tracking
Provides percentage completion updates during transcription process
"""

import sys
import json
import time
import warnings
import torch
import librosa
from pathlib import Path
from transformers import pipeline
import threading
from datetime import datetime

# Suppress warnings for cleaner output
warnings.filterwarnings("ignore", message="The input name `inputs` is deprecated")

class ProgressTracker:
    """
    Manages progress tracking and real-time updates during transcription
    This class demonstrates how to coordinate between different processing stages
    """
    
    def __init__(self, audio_duration_seconds):
        self.audio_duration = audio_duration_seconds
        self.current_progress = 0
        self.stage = "initializing"
        self.start_time = time.time()
        self.chunk_size = 30  # Whisper processes in 30-second chunks
        self.total_chunks = max(1, int(audio_duration_seconds / self.chunk_size) + 1)
        self.processed_chunks = 0
        
    def update_stage(self, stage_name, progress_percent=None):
        """Update current processing stage with optional progress override"""
        self.stage = stage_name
        if progress_percent is not None:
            self.current_progress = progress_percent
        self._emit_progress()
        
    def update_chunk_progress(self, chunks_completed):
        """Update progress based on completed audio chunks"""
        self.processed_chunks = chunks_completed
        # Calculate progress: 10% for setup, 80% for processing, 10% for finalization
        processing_progress = min(80, (chunks_completed / self.total_chunks) * 80)
        self.current_progress = 10 + processing_progress
        self._emit_progress()
        
    def _emit_progress(self):
        """
        Send progress update to Node.js process via stderr
        Using stderr keeps progress separate from final JSON result on stdout
        """
        elapsed_time = time.time() - self.start_time
        
        progress_data = {
            "type": "progress",
            "percentage": round(self.current_progress, 1),
            "stage": self.stage,
            "elapsed_time": round(elapsed_time, 1),
            "estimated_total_time": self._estimate_total_time(elapsed_time),
            "timestamp": datetime.now().isoformat()
        }
        
        # Emit progress on stderr so Node.js can capture it separately
        print(f"PROGRESS:{json.dumps(progress_data)}", file=sys.stderr, flush=True)
        
    def _estimate_total_time(self, elapsed_time):
        """Estimate total processing time based on current progress"""
        if self.current_progress > 5:  # Avoid division by very small numbers
            estimated_total = (elapsed_time / self.current_progress) * 100
            return round(estimated_total, 1)
        return None

def get_audio_duration(audio_file_path):
    """
    Get audio file duration using librosa
    This is essential for accurate progress tracking
    """
    try:
        duration = librosa.get_duration(path=audio_file_path)
        return duration
    except Exception as e:
        print(f"Warning: Could not determine audio duration: {e}", file=sys.stderr)
        return 300  # Default to 5 minutes if duration can't be determined

def setup_transcription_pipeline(model_name="openai/whisper-small", progress_tracker=None):
    """
    Set up transcription pipeline without chunking for better long-form results
    """
    if progress_tracker:
        progress_tracker.update_stage("loading_model", 5)
    
    # Device detection with progress updates
    if torch.cuda.is_available():
        device = "cuda"
        dtype = torch.float16
        print("Using CUDA GPU acceleration", file=sys.stderr)
    elif torch.backends.mps.is_available():
        device = "mps" 
        dtype = torch.float16
        print("Using Apple Metal Performance Shaders", file=sys.stderr)
    else:
        device = "cpu"
        dtype = torch.float32
        print("Using CPU processing", file=sys.stderr)
    
    if progress_tracker:
        progress_tracker.update_stage("initializing_pipeline", 8)
    
    print(f"Loading Whisper model: {model_name}", file=sys.stderr)
    
    # Create pipeline with return_timestamps=True for long-form transcription
    pipe = pipeline(
        "automatic-speech-recognition",
        model=model_name,
        device=device,
        return_timestamps=True
    )
    
    if progress_tracker:
        progress_tracker.update_stage("model_ready", 10)
    
    return pipe

class ProgressAwareTranscriber:
    """
    Custom transcriber that provides progress updates during processing
    """
    
    def __init__(self, pipeline_obj, progress_tracker):
        self.pipeline = pipeline_obj
        self.progress_tracker = progress_tracker
        
    def transcribe_with_progress(self, audio_file_path):
        """
        Transcribe audio with progress tracking using pipeline (no chunking)
        """
        self.progress_tracker.update_stage("starting_transcription", 10)
        
        # Start transcription - we'll simulate progress since Whisper doesn't 
        # natively provide granular progress callbacks
        result = self._transcribe_with_simulated_progress(audio_file_path)
        
        self.progress_tracker.update_stage("finalizing", 95)
        return result
        
    def _transcribe_with_simulated_progress(self, audio_file_path):
        """
        Perform transcription with simulated progress updates
        """
        # Start a background thread to provide progress updates
        progress_thread = threading.Thread(
            target=self._simulate_progress_updates, 
            daemon=True
        )
        progress_thread.start()
        
        # Perform the actual transcription WITHOUT chunking
        result = self.pipeline(str(audio_file_path))
        
        # Stop progress simulation (thread will end naturally as daemon)
        self.progress_tracker.update_stage("processing_complete", 90)
        
        return result
        
    def _simulate_progress_updates(self):
        """
        Simulate progress updates during transcription
        """
        progress_points = [15, 25, 35, 45, 55, 65, 75, 85]
        
        for progress in progress_points:
            time.sleep(self.progress_tracker.audio_duration / 20)  # Distribute updates over time
            if self.progress_tracker.current_progress < progress:
                chunk_estimate = int((progress - 10) / 80 * self.progress_tracker.total_chunks)
                self.progress_tracker.update_chunk_progress(chunk_estimate)

def transcribe_audio_file_with_progress(audio_file_path, model_name="openai/whisper-small"):
    """
    Main transcription function with integrated progress tracking
    """
    start_time = time.time()
    
    # Validate input file
    audio_path = Path(audio_file_path)
    if not audio_path.exists():
        return {
            "success": False,
            "error": f"Audio file not found: {audio_file_path}",
            "processing_time": 0
        }
    
    try:
        # Get audio duration for accurate progress tracking
        print("Analyzing audio file...", file=sys.stderr)
        audio_duration = get_audio_duration(audio_file_path)
        print(f"Audio duration: {audio_duration:.1f} seconds", file=sys.stderr)
        
        # Initialize progress tracker
        progress_tracker = ProgressTracker(audio_duration)
        progress_tracker.update_stage("analyzing_audio", 2)
        
        # Set up transcription pipeline (WITHOUT chunking)
        pipe = setup_transcription_pipeline(model_name, progress_tracker)
        
        # Create progress-aware transcriber
        transcriber = ProgressAwareTranscriber(pipe, progress_tracker)
        
        # Perform transcription with progress updates
        result = transcriber.transcribe_with_progress(audio_file_path)
        
        processing_time = time.time() - start_time
        progress_tracker.update_stage("complete", 100)
        
        print(f"Transcription completed in {processing_time:.2f} seconds", file=sys.stderr)
        
        # Structure the final response
        api_response = {
            "success": True,
            "text": result["text"].strip(),
            "processing_time": round(processing_time, 2),
            "model_used": model_name,
            "audio_duration": round(audio_duration, 2),
            "chunks": []
        }
        
        # Process chunks if available
        if "chunks" in result and result["chunks"]:
            for chunk in result["chunks"]:
                if not chunk["text"].strip():
                    continue
                    
                if (isinstance(chunk.get("timestamp"), tuple) and 
                    len(chunk["timestamp"]) == 2):
                    
                    chunk_start = max(0, chunk["timestamp"][0] if chunk["timestamp"][0] is not None else 0)
                    chunk_end = max(chunk_start, chunk["timestamp"][1] if chunk["timestamp"][1] is not None else chunk_start)

                    api_response["chunks"].append({
                        "text": chunk["text"].strip(),
                        "start": round(chunk_start, 2),
                        "end": round(chunk_end, 2)
                    })
        
        return api_response
        
    except Exception as e:
        error_time = time.time() - start_time
        print(f"Transcription failed after {error_time:.2f} seconds: {str(e)}", file=sys.stderr)
        
        return {
            "success": False,
            "error": f"Transcription failed: {str(e)}",
            "processing_time": round(error_time, 2)
        }

def main():
    """
    Command line interface with progress tracking
    Usage: python whisper_local.py <audio_file_path>
    """
    
    if len(sys.argv) != 2:
        error_response = {
            "success": False,
            "error": "Usage: python whisper_local.py <audio_file_path>",
            "processing_time": 0
        }
        print(json.dumps(error_response, indent=2))
        sys.exit(1)
    
    audio_file_path = sys.argv[1]
    model_name = "openai/whisper-small"
    
    # Perform transcription with progress tracking
    result = transcribe_audio_file_with_progress(audio_file_path, model_name)
    
    # Output final result as JSON
    print(json.dumps(result, indent=2, ensure_ascii=False))
    
    # Exit with appropriate code
    sys.exit(0 if result["success"] else 1)

if __name__ == "__main__":
    main()