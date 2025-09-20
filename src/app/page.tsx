'use client';

import { useState } from 'react';
import AudioUploader from '@/components/AudioUploader';
import LinkInput from '@/components/LinkInput';
import AudioRecorder from '@/components/AudioRecorder';
import TranscriptionResult from '@/components/TranscriptionResult';

// Types for progress tracking
interface ProgressState {
  percentage: number;
  stage: string;
  elapsed_time: number;
  estimated_total_time?: number;
  isActive: boolean;
}

export default function Home() {
  const [transcription, setTranscription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('upload'); // 'upload', 'link', or 'record'
  
  // New progress tracking state
  const [progress, setProgress] = useState<ProgressState>({
    percentage: 0,
    stage: 'idle',
    elapsed_time: 0,
    estimated_total_time: undefined,
    isActive: false
  });

  const handleTranscriptionComplete = (result: string) => {
    setTranscription(result);
    setIsLoading(false);
    // Reset progress when transcription completes
    setProgress(prev => ({ ...prev, isActive: false }));
  };

  // Helper function to process streaming responses
  const processStreamingResponse = async (response: Response) => {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error('Failed to establish streaming connection');
    }

    // Process streaming response with progress updates
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const eventData = JSON.parse(line.substring(6));
            console.log('Progress event:', eventData);

            if (eventData.type === 'progress') {
              // Update progress state
              setProgress(prev => ({
                ...prev,
                percentage: eventData.percentage,
                stage: eventData.stage,
                elapsed_time: eventData.elapsed_time,
                estimated_total_time: eventData.estimated_total_time
              }));
            } else if (eventData.type === 'complete') {
              // Transcription completed successfully
              const result = eventData.result;
              setTranscription(result);
              setProgress(prev => ({
                ...prev,
                percentage: 100,
                stage: 'complete',
                isActive: false
              }));
              setIsLoading(false);
              console.log('Transcription completed:', result);
              break;
            } else if (eventData.type === 'error') {
              throw new Error(eventData.error || 'Transcription failed');
            }
          } catch (parseError) {
            console.warn('Failed to parse event data:', line, parseError);
          }
        }
      }
    }

    reader.releaseLock();
  };

  // New enhanced handler for progress-enabled transcription
  const handleProgressTranscription = async (audioData: Blob | FormData) => {
    setIsLoading(true);
    setTranscription('');
    setProgress({
      percentage: 0,
      stage: 'starting',
      elapsed_time: 0,
      estimated_total_time: undefined,
      isActive: true
    });

    try {
      // Prepare form data and determine endpoint
      let formData: FormData;
      let endpoint: string;
      
      if (audioData instanceof FormData) {
        formData = audioData;
        // Check if this is URL data (has audioUrl field)
        if (formData.has('audioUrl')) {
          endpoint = '/api/transcribe-url';
          // Convert FormData to JSON for URL transcription
          const audioUrl = formData.get('audioUrl') as string;
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'text/event-stream'
            },
            body: JSON.stringify({ audioUrl })
          });
          
          if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
          }
          
          // Process the streaming response
          await processStreamingResponse(response);
          return;
        } else {
          endpoint = '/api/transcribe/local';
        }
      } else {
        formData = new FormData();
        formData.append('audio', audioData, 'audio.mp3');
        endpoint = '/api/transcribe/local';
      }

      // Make request with Server-Sent Events header for progress tracking
      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'text/event-stream'
        }
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      // Set up streaming response reader
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('Failed to establish streaming connection');
      }

      // Process streaming response with progress updates
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const eventData = JSON.parse(line.substring(6));
              console.log('Progress event:', eventData);

              if (eventData.type === 'progress') {
                // Update progress state
                setProgress(prev => ({
                  ...prev,
                  percentage: eventData.percentage,
                  stage: eventData.stage,
                  elapsed_time: eventData.elapsed_time,
                  estimated_total_time: eventData.estimated_total_time
                }));
              } else if (eventData.type === 'complete') {
                // Transcription completed successfully
                const result = eventData.result;
                setTranscription(result);
                setProgress(prev => ({
                  ...prev,
                  percentage: 100,
                  stage: 'complete',
                  isActive: false
                }));
                setIsLoading(false);
                console.log('Transcription completed:', result);
              } else if (eventData.type === 'error') {
                // Handle error
                console.error('Transcription error:', eventData.error);
                setProgress(prev => ({ ...prev, isActive: false }));
                setIsLoading(false);
                alert(`Transcription failed: ${eventData.error}`);
              }
            } catch (parseError) {
              console.warn('Failed to parse event data:', parseError);
            }
          }
        }
      }

    } catch (error) {
      console.error('Transcription error:', error);
      setIsLoading(false);
      setProgress(prev => ({ ...prev, isActive: false }));
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Transcription failed: ${errorMessage}`);
    }
  };

  // Helper functions for progress display
  const getStageDescription = (stage: string): string => {
    const descriptions: Record<string, string> = {
      'idle': 'Ready to process',
      'starting': 'Initializing...',
      'analyzing_audio': 'Analyzing audio...',
      'loading_model': 'Loading AI model...',
      'initializing_pipeline': 'Setting up pipeline...',
      'model_ready': 'Model ready',
      'starting_transcription': 'Starting transcription...',
      'processing_complete': 'Processing audio...',
      'finalizing': 'Finalizing...',
      'complete': 'Complete!'
    };
    return descriptions[stage] || stage;
  };

  const formatTime = (seconds: number): string => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Determine which handler to use based on active tab
  const getTranscriptionHandler = () => {
    // Enable progress tracking for upload tab only (record handles its own transcription)
    if (activeTab === 'upload') {
      return {
        onTranscriptionStart: () => {
          // This will be handled by handleProgressTranscription
        },
        onTranscriptionComplete: handleProgressTranscription, // Use the progress-enabled handler
        enableProgress: true
      };
    } else if (activeTab === 'record') {
      // Record tab handles transcription directly and returns string results
      return {
        onTranscriptionStart: () => setIsLoading(true),
        onTranscriptionComplete: handleTranscriptionComplete, // Use the simple handler for string results
        enableProgress: false
      };
    } else {
      // Use original handlers for other tabs (like 'link')
      return {
        onTranscriptionStart: () => setIsLoading(true),
        onTranscriptionComplete: handleTranscriptionComplete,
        enableProgress: false
      };
    }
  };

  const transcriptionProps = getTranscriptionHandler();

  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {/* Background decoration */}
      <div className="absolute inset-0 opacity-40">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.03'%3E%3Ccircle cx='30' cy='30' r='4'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}></div>
      </div>
      
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-start py-12 px-4">
        <div className="w-full max-w-4xl">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl mb-6 shadow-lg">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <h1 className="text-5xl font-bold bg-gradient-to-r from-gray-900 via-blue-800 to-purple-800 bg-clip-text text-transparent mb-4">
              Audio Transcription
            </h1>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Transform your audio content into text with AI-powered transcription. Upload files, paste YouTube links, or record directly.
            </p>
          </div>
        
        {/* Modern Tab Navigation */}
        <div className="w-full max-w-2xl mx-auto mb-8">
          <div className="flex bg-white/70 backdrop-blur-sm rounded-2xl p-2 shadow-lg border border-white/20">
            <button
              className={`flex-1 flex items-center justify-center py-3 px-6 rounded-xl font-medium transition-all duration-300 ${
                activeTab === 'upload' 
                  ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg transform scale-105' 
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
              }`}
              onClick={() => setActiveTab('upload')}
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              Upload File
              {transcriptionProps.enableProgress && <span className="ml-2 text-yellow-300">✨</span>}
            </button>
            <button
              className={`flex-1 flex items-center justify-center py-3 px-6 rounded-xl font-medium transition-all duration-300 ${
                activeTab === 'link' 
                  ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg transform scale-105' 
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
              }`}
              onClick={() => setActiveTab('link')}
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              YouTube Link
              {transcriptionProps.enableProgress && <span className="ml-2 text-yellow-300">✨</span>}
            </button>
            <button
              className={`flex-1 flex items-center justify-center py-3 px-6 rounded-xl font-medium transition-all duration-300 ${
                activeTab === 'record' 
                  ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg transform scale-105' 
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
              }`}
              onClick={() => setActiveTab('record')}
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
              Record Audio
              {transcriptionProps.enableProgress && <span className="ml-2 text-yellow-300">✨</span>}
            </button>
          </div>
        </div>
        
          {/* Modern Progress Bar - Only show when active */}
          {progress.isActive && (
            <div className="w-full max-w-2xl mx-auto mb-8">
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-white/20">
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center">
                    <div className="relative">
                      <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-200"></div>
                      <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent absolute top-0"></div>
                    </div>
                    <div className="ml-4">
                      <span className="text-gray-900 font-semibold block">
                        {getStageDescription(progress.stage)}
                      </span>
                      <span className="text-gray-500 text-sm">
                        Processing your audio...
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-bold bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
                      {progress.percentage.toFixed(1)}%
                    </span>
                  </div>
                </div>
                
                {/* Modern Progress bar */}
                <div className="w-full bg-gray-100 rounded-full h-4 overflow-hidden shadow-inner">
                  <div 
                    className="bg-gradient-to-r from-blue-500 via-purple-500 to-indigo-600 h-full rounded-full transition-all duration-700 ease-out shadow-sm"
                    style={{ width: `${Math.min(100, Math.max(0, progress.percentage))}%` }}
                  ></div>
                </div>
                
                {/* Time information */}
                <div className="flex justify-between text-sm text-gray-500 mt-3">
                  <span className="flex items-center">
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {formatTime(progress.elapsed_time)}
                  </span>
                  {progress.estimated_total_time && (
                    <span className="flex items-center">
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      ETA: {formatTime(progress.estimated_total_time)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
          
          {/* Modern Input Components Container */}
          <div className="w-full max-w-2xl mx-auto mb-8">
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-white/20 overflow-hidden">
              <div className="p-8">
                {activeTab === 'upload' && (
                  <AudioUploader 
                    onTranscriptionStart={transcriptionProps.onTranscriptionStart}
                    onTranscriptionComplete={transcriptionProps.onTranscriptionComplete}
                    enableProgress={transcriptionProps.enableProgress}
                  />
                )}
                
                {activeTab === 'link' && (
                  <LinkInput 
                    onTranscriptionStart={transcriptionProps.onTranscriptionStart}
                    onTranscriptionComplete={(result) => {
                      if (typeof result === 'string') {
                        handleTranscriptionComplete(result);
                      } else {
                        // FormData case - should not happen for link input
                        console.error('Unexpected FormData result from LinkInput');
                      }
                    }}
                    enableProgress={transcriptionProps.enableProgress}
                  />
                )}
                
                {activeTab === 'record' && (
                  <AudioRecorder 
                    onTranscriptionStart={() => setIsLoading(true)}
                    onTranscriptionComplete={handleTranscriptionComplete}
                  />
                )}
              </div>
            </div>
          </div>
        
          {/* Modern Loading State - Only show when not using progress tracking */}
          {isLoading && !progress.isActive && (
            <div className="w-full max-w-2xl mx-auto">
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-lg border border-white/20 text-center">
                <div className="relative inline-flex">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200"></div>
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent absolute top-0"></div>
                </div>
                <p className="mt-4 text-gray-600 font-medium">Processing your audio...</p>
                <p className="text-sm text-gray-500 mt-2">This may take a few moments</p>
              </div>
            </div>
          )}
          
          {/* Modern Results */}
          {transcription && !isLoading && (
            <div className="w-full max-w-4xl mx-auto">
              {/* Success indicator when using progress tracking */}
              {progress.stage === 'complete' && (
                <div className="mb-6 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="flex items-center justify-center w-10 h-10 bg-green-100 rounded-full">
                        <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    </div>
                    <div className="ml-4">
                      <p className="text-green-800 font-semibold">Transcription Complete!</p>
                      <p className="text-green-600 text-sm">Completed in {formatTime(progress.elapsed_time)}</p>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-white/20 overflow-hidden">
                <TranscriptionResult transcription={transcription} />
              </div>
            </div>
          )}
          
          {/* Development Debug Info */}
          {process.env.NODE_ENV === 'development' && progress.isActive && (
            <div className="w-full max-w-2xl mx-auto mt-8">
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                <details>
                  <summary className="font-bold cursor-pointer text-yellow-800">Debug Progress State</summary>
                  <pre className="mt-2 text-xs text-gray-600 bg-white rounded p-2 overflow-auto">
                    {JSON.stringify(progress, null, 2)}
                  </pre>
                </details>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
