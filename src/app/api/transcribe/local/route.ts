import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Directory for temporary storage
const TEMP_DIR = path.join(process.cwd(), 'tmp');

// Create temp directory if it doesn't exist
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Types for progress tracking
interface ProgressUpdate {
  type: 'progress';
  percentage: number;
  stage: string;
  elapsed_time: number;
  estimated_total_time?: number;
  timestamp: string;
}

interface TranscriptionResult {
  success: boolean;
  text?: string;
  processing_time: number;
  model_used?: string;
  audio_duration?: number;
  chunks?: Array<{
    text: string;
    start: number;
    end: number;
  }>;
  error?: string;
}

export async function POST(request: NextRequest) {
  try {
    console.log("Local transcription API route called with progress tracking");
    
    // Handle file upload (same as before)
    const fileId = uuidv4();
    const filePath = path.join(TEMP_DIR, `${fileId}.mp3`);
    
    const formData = await request.formData();
    const audioFile = formData.get('audio');
    
    if (!audioFile || !(audioFile instanceof Blob)) {
      console.log("No valid audio file found in request");
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }
    
    console.log("Audio file received, size:", (audioFile as Blob).size, "bytes");
    
    // Save the file
    const buffer = Buffer.from(await audioFile.arrayBuffer());
    fs.writeFileSync(filePath, buffer);
    console.log("Audio saved to:", filePath);
    
    // Check if this is a Server-Sent Events request for progress tracking
    const acceptHeader = request.headers.get('accept');
    console.log("Accept header received:", acceptHeader);
    const isProgressRequest = acceptHeader?.includes('text/event-stream');
    
    if (isProgressRequest) {
      // Return streaming response with progress updates
      return handleProgressStreamRequest(filePath);
    } else {
      // Return regular JSON response (backward compatibility)
      return handleRegularRequest(filePath);
    }
    
  } catch (error) {
    console.error("Error in API route:", error);
    return NextResponse.json({ 
      error: 'Server error processing transcription: ' + (error as Error).message 
    }, { status: 500 });
  }
}

async function handleProgressStreamRequest(filePath: string) {
  /*
   * Create a Server-Sent Events (SSE) stream for real-time progress updates
   * This allows the frontend to receive progress updates as they happen
   */
  
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    start(controller) {
      // Start the Python transcription process
      runPythonScriptWithProgress(filePath, {
        onProgress: (progress: ProgressUpdate) => {
          // Send progress update as Server-Sent Event
          const sseData = `data: ${JSON.stringify(progress)}\n\n`;
          controller.enqueue(encoder.encode(sseData));
        },
        onComplete: (result: TranscriptionResult) => {
          // Send final result
          const finalData = `data: ${JSON.stringify({ type: 'complete', result })}\n\n`;
          controller.enqueue(encoder.encode(finalData));
          
          // Close the stream
          controller.close();
          
          // Clean up file
          cleanupFile(filePath);
        },
        onError: (error: string) => {
          // Send error and close stream
          const errorData = `data: ${JSON.stringify({ type: 'error', error })}\n\n`;
          controller.enqueue(encoder.encode(errorData));
          controller.close();
          
          // Clean up file
          cleanupFile(filePath);
        }
      });
    }
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    }
  });
}

async function handleRegularRequest(filePath: string): Promise<NextResponse> {
  /*
   * Handle regular request without progress streaming
   * This maintains backward compatibility with existing frontend code
   */
  
  const scriptPath = path.join(process.cwd(), 'src', 'app', 'api', 'transcribe', 'local', 'whisper_local.py');
  
  if (!fs.existsSync(scriptPath)) {
    console.error("Python script not found at:", scriptPath);
    return NextResponse.json({ error: 'Server configuration error: Script not found' }, { status: 500 });
  }
  
  try {
    console.log("Running Python script from:", scriptPath);
    const result = await runPythonScript(scriptPath, [filePath]);
    
    // Clean up file
    cleanupFile(filePath);
    
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error running Python script:", error);
    cleanupFile(filePath);
    return NextResponse.json({ 
      error: 'Transcription failed: ' + (error as Error).message 
    }, { status: 500 });
  }
}

function runPythonScriptWithProgress(
  filePath: string, 
  callbacks: {
    onProgress: (progress: ProgressUpdate) => void;
    onComplete: (result: TranscriptionResult) => void;
    onError: (error: string) => void;
  }
) {
  /*
   * Run Python script with real-time progress tracking
   * This demonstrates advanced inter-process communication patterns
   */
  
  const pythonPath = process.env.PYTHON_PATH || '/Users/stellaandorno/.pyenv/versions/whisper_stepbystep/bin/python';
  const scriptPath = path.join(process.cwd(), 'src', 'app', 'api', 'transcribe', 'local', 'whisper_local.py');
  
  console.log(`Executing with progress: ${pythonPath} ${scriptPath} ${filePath}`);
  
  const pythonProcess = spawn(pythonPath, [scriptPath, filePath]);
  
  let stdoutData = '';
  let stderrData = '';
  
  // Handle stdout (final result)
  pythonProcess.stdout.on('data', (data) => {
    const chunk = data.toString();
    stdoutData += chunk;
  });
  
  // Handle stderr (progress updates and debug info)
  pythonProcess.stderr.on('data', (data) => {
    const chunk = data.toString();
    stderrData += chunk;
    
    // Look for progress updates in stderr
    const lines = chunk.split('\n');
    for (const line of lines) {
      if (line.startsWith('PROGRESS:')) {
        try {
          const progressJson = line.substring('PROGRESS:'.length);
          const progressData: ProgressUpdate = JSON.parse(progressJson);
          callbacks.onProgress(progressData);
        } catch (e) {
          console.log('Failed to parse progress update:', e);
        }
      } else if (line.trim()) {
        // Regular debug output
        console.log("Python debug:", line);
      }
    }
  });
  
  // Handle process completion
  pythonProcess.on('close', (code) => {
    console.log(`Python process exited with code ${code}`);
    
    if (code !== 0) {
      console.error("Python process error output:", stderrData);
      callbacks.onError(`Python script exited with code ${code}: ${stderrData}`);
      return;
    }
    
    try {
      // Parse final result from stdout
      const jsonMatch = stdoutData.match(/(\{[\s\S]*\})/);
      if (jsonMatch) {
        const result: TranscriptionResult = JSON.parse(jsonMatch[1]);
        callbacks.onComplete(result);
      } else {
        console.error("No JSON found in Python output");
        callbacks.onError("Invalid response format from transcription service");
      }
    } catch (error) {
      console.error("Error parsing Python output:", error);
      callbacks.onError("Failed to parse transcription result");
    }
  });
  
  // Handle process spawn errors
  pythonProcess.on('error', (error) => {
    console.error("Failed to start Python process:", error);
    callbacks.onError(`Failed to start transcription process: ${error.message}`);
  });
}

// Original function kept for backward compatibility
async function runPythonScript(scriptPath: string, args: string[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const pythonPath = process.env.PYTHON_PATH || '/Users/stellaandorno/.pyenv/versions/whisper_stepbystep/bin/python';
    
    console.log(`Executing: ${pythonPath} ${scriptPath} ${args.join(' ')}`);
    
    const pythonProcess = spawn(pythonPath, [scriptPath, ...args]);
    
    let stdoutData = '';
    let stderrData = '';
    
    pythonProcess.stdout.on('data', (data) => {
      const chunk = data.toString();
      console.log("Python stdout chunk:", chunk.substring(0, 100) + (chunk.length > 100 ? '...' : ''));
      stdoutData += chunk;
    });
    
    pythonProcess.stderr.on('data', (data) => {
      const chunk = data.toString();
      console.log("Python stderr chunk:", chunk);
      stderrData += chunk;
    });
    
    pythonProcess.on('close', (code) => {
      console.log(`Python process exited with code ${code}`);
      
      if (code !== 0) {
        console.error("Python process error output:", stderrData);
        reject(new Error(`Python script exited with code ${code}: ${stderrData}`));
        return;
      }
      
      try {
        const jsonMatch = stdoutData.match(/(\{[\s\S]*\})/);
        if (jsonMatch) {
          const jsonStr = jsonMatch[1];
          const result = JSON.parse(jsonStr);
          resolve(result);
        } else {
          console.error("No JSON found in Python output");
          console.log("Raw output:", stdoutData);
          resolve({ text: stdoutData.trim() });
        }
      } catch (error) {
        console.error("Error parsing Python output:", error);
        console.log("Raw output that failed to parse:", stdoutData);
        reject(error);
      }
    });
    
    pythonProcess.on('error', (error) => {
      console.error("Failed to start Python process:", error);
      reject(error);
    });
  });
}

function cleanupFile(filePath: string) {
  /*
   * Clean up temporary files with proper error handling
   */
  try {
    fs.unlinkSync(filePath);
    console.log("Temporary file deleted:", filePath);
  } catch (error) {
    console.error("Error deleting temporary file:", error);
  }
}