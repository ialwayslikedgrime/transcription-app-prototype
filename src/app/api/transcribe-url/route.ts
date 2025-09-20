// src/app/api/transcribe-url/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

import { exec } from 'child_process';
import { promisify } from 'util';



// Convert the callback-based exec function to a promise-based one
const execAsync = promisify(exec);

// Directory for temporary storage (same as your existing route)
const TEMP_DIR = path.join(process.cwd(), 'tmp');

// Create temp directory if it doesn't exist
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}





function isYouTubeURL(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    const youtubeHosts = [
      'youtube.com',
      'www.youtube.com',
      'm.youtube.com',
      'youtu.be'
    ];
    
    const isYouTubeDomain = youtubeHosts.includes(hostname);
    
    if (hostname.includes('youtube.com')) {
      // Check for various YouTube URL patterns:
      // /watch?v=, /shorts/, /embed/, or v= parameter
      const hasVideoPath = urlObj.pathname.includes('/watch') || 
                          urlObj.pathname.includes('/shorts/') ||  // ADD THIS LINE
                          urlObj.pathname.includes('/embed/') ||
                          urlObj.searchParams.has('v');
      return isYouTubeDomain && hasVideoPath;
    }
    
    if (hostname === 'youtu.be') {
      return urlObj.pathname.length > 1;
    }
    
    return false;
    
  } catch (error) {
    console.log("URL parsing failed for:", url, error);
    return false;
  }
}

// Streaming transcription handler (copied from local transcribe route)
async function handleStreamingTranscription(scriptPath: string, filePath: string) {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      
      try {
        await runPythonScriptWithProgress(scriptPath, [filePath], (progress) => {
          // Send progress update to client
          const data = `data: ${JSON.stringify(progress)}\n\n`;
          controller.enqueue(encoder.encode(data));
        });
        
        // Send completion signal
        const completionData = `data: ${JSON.stringify({ type: 'complete' })}\n\n`;
        controller.enqueue(encoder.encode(completionData));
        
      } catch (error) {
        console.error('Streaming transcription error:', error);
        const errorData = `data: ${JSON.stringify({ 
          type: 'error', 
          error: error instanceof Error ? error.message : 'Unknown error' 
        })}\n\n`;
        controller.enqueue(encoder.encode(errorData));
      } finally {
        // Clean up the temporary file
        try {
          fs.unlinkSync(filePath);
          console.log("Temporary file deleted:", filePath);
        } catch (error) {
          console.error("Could not delete temporary file:", error);
        }
        
        controller.close();
      }
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

export async function POST(request: NextRequest) {
  try {
    console.log("URL transcription API route called");
    
    // Get the audio URL from the request body
    const { audioUrl } = await request.json();
    
    if (!audioUrl) {
      return NextResponse.json({ error: 'Audio URL is required' }, { status: 400 });
    }

    console.log("Processing URL:", audioUrl);
    
    // Check if the client wants streaming progress updates
    const acceptHeader = request.headers.get('accept');
    const wantsStreaming = acceptHeader?.includes('text/event-stream');

    // Generate unique file ID for temporary storage
    const fileId = uuidv4();
    const filePath = path.join(TEMP_DIR, `${fileId}.mp3`);
    
    // Download audio from URL (YouTube or regular URL)
    if (isYouTubeURL(audioUrl)) {
      console.log("Detected YouTube URL, downloading...");
      await downloadYouTubeAudio(audioUrl, filePath);
    } else {
      console.log("Detected regular URL, downloading...");
      await downloadAudioFromUrl(audioUrl, filePath);
    }

    console.log("Audio downloaded successfully to:", filePath);

    // Use your existing Python script path
    const scriptPath = path.join(process.cwd(), 'src', 'app', 'api', 'transcribe', 'local', 'whisper_local.py');
    
    if (!fs.existsSync(scriptPath)) {
      console.error("Python script not found at:", scriptPath);
      return NextResponse.json({ error: 'Server configuration error: Script not found' }, { status: 500 });
    }
    
    console.log("Running Python transcription script...");

    if (wantsStreaming) {
      // Return streaming response with progress updates
      console.log("Accept header received: text/event-stream");
      return handleStreamingTranscription(scriptPath, filePath);
    } else {
      // Return regular JSON response (backward compatibility)
      const result = await runPythonScriptWithProgress(scriptPath, [filePath]);
      
      // Clean up the temporary file
      try {
        fs.unlinkSync(filePath);
        console.log("Temporary file cleaned up successfully");
      } catch (error) {
        console.error("Warning: Could not delete temporary file:", error);
      }
      
      return NextResponse.json(result);
    }
    
  } catch (error) {
    console.error("Error in URL transcription route:", error);
    return NextResponse.json({ 
      error: 'Server error processing URL',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}



// Replace the downloadYouTubeAudio function with this:
async function downloadYouTubeAudio(url: string, outputPath: string): Promise<void> {
  try {
    console.log("=== Starting yt-dlp YouTube Download ===");
    console.log("URL:", url);
    console.log("Target path:", outputPath);
    
    const pathWithoutExtension = outputPath.replace(/\.[^/.]+$/, "");
    
    // Use the yt-dlp from your virtual environment
    const ytDlpPath = path.join(process.cwd(), '.venv', 'bin', 'yt-dlp');
    
    // Construct the command using the full path to yt-dlp
    const command = `"${ytDlpPath}" -x --audio-format mp3 -o "${pathWithoutExtension}.%(ext)s" "${url}"`;
    
    console.log("Executing command:", command);
    
    const { stdout, stderr } = await execAsync(command, {
      timeout: 300000,
      // Also set the environment to include your venv
      env: { 
        ...process.env, 
        PATH: `${path.join(process.cwd(), '.venv', 'bin')}:${process.env.PATH}`,
        PYTHONPATH: path.join(process.cwd(), '.venv', 'lib', 'python3.10', 'site-packages')
      }
    });

    console.log("yt-dlp completed successfully");
    console.log("Output:", stdout);
    
    // Log any warnings (stderr often contains non-error information)
    if (stderr) {
      console.log("yt-dlp warnings/info:", stderr);
    }
    
    // Verify the file was actually created
    // yt-dlp creates files with the original extension, so we need to check for .mp3
    const expectedFile = `${pathWithoutExtension}.mp3`;
    if (!fs.existsSync(expectedFile)) {
      throw new Error(`Expected audio file was not created at: ${expectedFile}`);
    }
    
    // If the expected filename is different from what we originally wanted, rename it
    if (expectedFile !== outputPath) {
      fs.renameSync(expectedFile, outputPath);
      console.log(`Renamed ${expectedFile} to ${outputPath}`);
    }
    
    console.log("YouTube audio download completed successfully");
    
  } catch (error) {
    console.error("yt-dlp download failed:", error);
    
    // Provide more helpful error messages based on common failure scenarios
    if (error instanceof Error) {
      if (error.message.includes('timeout')) {
        throw new Error("Download timed out - the video might be too long or your connection too slow");
      } else if (error.message.includes('not available')) {
        throw new Error("This YouTube video is not available for download (might be private or deleted)");
      } else {
        throw new Error(`YouTube download failed: ${error.message}`);
      }
    } else {
      throw new Error("Unknown error occurred during YouTube download");
    }
  }
}


// Function to download audio from regular URLs
async function downloadAudioFromUrl(url: string, outputPath: string): Promise<void> {
  try {
    console.log("Fetching audio from URL...");
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch audio: ${response.status} ${response.statusText}`);
    }
    
    // Convert response to buffer and save to file
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(outputPath, buffer);
    
    console.log('Regular URL audio download completed successfully');
  } catch (error) {
    console.error('Error downloading from regular URL:', error);
    throw new Error(`Failed to download audio from URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Python script runner with progress support (adapted from local transcribe route)
async function runPythonScriptWithProgress(
  scriptPath: string, 
  args: string[], 
  onProgress?: (progress: any) => void
): Promise<any> {
  return new Promise((resolve, reject) => {

    // python path ! env
    const pythonPath = path.join(process.cwd(), '.venv', 'bin', 'python');
    
    console.log(`Executing Python script: ${pythonPath} ${scriptPath} ${args.join(' ')}`);
    
    // Spawn the Python process
    const pythonProcess = spawn(pythonPath, [scriptPath, ...args]);
    
    let stdoutData = '';
    let stderrData = '';
    
    // Collect standard output
    pythonProcess.stdout.on('data', (data) => {
      const chunk = data.toString();
      console.log("Python stdout:", chunk.substring(0, 100) + (chunk.length > 100 ? '...' : ''));
      stdoutData += chunk;
    });
    
    // Collect error output and parse progress
    pythonProcess.stderr.on('data', (data) => {
      const chunk = data.toString();
      console.log("Python stderr:", chunk);
      stderrData += chunk;
      
      // Parse progress updates from stderr
      if (onProgress) {
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.includes('PROGRESS:')) {
            try {
              const progressStr = line.substring(line.indexOf('PROGRESS:') + 9);
              const progressData = JSON.parse(progressStr);
              onProgress(progressData);
            } catch (e) {
              // Ignore malformed progress lines
            }
          }
        }
      }
    });
    
    // Handle process completion
    pythonProcess.on('close', (code) => {
      console.log(`Python process completed with exit code: ${code}`);
      
      if (code !== 0) {
        console.error("Python process failed with error:", stderrData);
        reject(new Error(`Python script failed with code ${code}: ${stderrData}`));
        return;
      }
      
      try {
        // Parse the JSON output (same logic as your working route)
        const jsonMatch = stdoutData.match(/(\{[\s\S]*\})/);
        if (jsonMatch) {
          const jsonStr = jsonMatch[1];
          const result = JSON.parse(jsonStr);
          console.log("Successfully parsed Python output");
          resolve(result);
        } else {
          console.log("No JSON found in output, returning raw text");
          resolve({ text: stdoutData.trim() });
        }
      } catch (error) {
        console.error("Error parsing Python output:", error);
        console.log("Raw output that failed to parse:", stdoutData);
        reject(new Error(`Failed to parse transcription result: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    });
    
    // Handle process spawn errors
    pythonProcess.on('error', (error) => {
      console.error("Failed to start Python process:", error);
      reject(new Error(`Failed to start Python transcription: ${error.message}`));
    });
  });
}