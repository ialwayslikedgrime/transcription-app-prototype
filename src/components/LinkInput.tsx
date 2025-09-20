// src/components/LinkInput.tsx
'use client';

import { useState } from 'react';

interface LinkInputProps {
  onTranscriptionStart: () => void;
  onTranscriptionComplete: (result: string | FormData) => void;
  enableProgress?: boolean;
}

export default function LinkInput({ onTranscriptionStart, onTranscriptionComplete, enableProgress = false }: LinkInputProps) {
  const [audioUrl, setAudioUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Helper function to detect YouTube URLs
  const isYouTubeUrl = (url: string) => {
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/;
    return youtubeRegex.test(url);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!audioUrl) return;
    
    setIsLoading(true);
    
    try {
      onTranscriptionStart();
      
      if (enableProgress) {
        // Use progress tracking - pass URL data to parent for streaming
        const urlData = new FormData();
        urlData.append('audioUrl', audioUrl);
        urlData.append('isYouTubeUrl', isYouTubeUrl(audioUrl).toString());
        await onTranscriptionComplete(urlData);
      } else {
        // Use the regular transcribe-url route (backward compatibility)
        const response = await fetch('/api/transcribe-url', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ audioUrl }),
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Transcription failed');
        }
        
        const data = await response.json();
        // Handle both possible response formats from your Python script
        onTranscriptionComplete(data.text || data.transcription || 'No transcription available');
      }
    } catch (error) {
      console.error('Error:', error);
      onTranscriptionComplete(`Error: ${error instanceof Error ? error.message : 'Could not transcribe audio from URL.'}`);
    } finally {
      if (!enableProgress) {
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="w-full">
      {/* Modern Progress tracking indicator */}
      {enableProgress && (
        <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl shadow-sm">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="flex items-center justify-center w-8 h-8 bg-blue-100 rounded-full">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
            </div>
            <div className="ml-3">
              <p className="text-blue-800 font-medium text-sm">Real-time Progress Tracking</p>
              <p className="text-blue-600 text-xs">Watch your YouTube transcription progress live</p>
            </div>
          </div>
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="audio-url" className="block text-sm font-semibold text-gray-700 mb-3">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-gray-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              Audio URL or YouTube Link
            </div>
          </label>
          <div className="relative">
            <input
              type="url"
              id="audio-url"
              placeholder="https://youtube.com/watch?v=... or https://example.com/audio.mp3"
              value={audioUrl}
              onChange={(e) => setAudioUrl(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-gray-900 placeholder-gray-400"
              required
              disabled={isLoading}
            />
            {audioUrl && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              </div>
            )}
          </div>
          {audioUrl && isYouTubeUrl(audioUrl) && (
            <div className="mt-3 p-3 bg-gradient-to-r from-red-50 to-pink-50 border border-red-100 rounded-lg">
              <div className="flex items-center">
                <svg className="w-5 h-5 text-red-500 mr-2" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
                <span className="text-red-700 font-medium text-sm">YouTube video detected</span>
              </div>
            </div>
          )}
        </div>
        
        <button
          type="submit"
          disabled={!audioUrl || isLoading}
          className={`w-full py-4 px-6 rounded-xl font-semibold text-white transition-all duration-300 transform ${
            !audioUrl || isLoading
              ? 'bg-gray-300 cursor-not-allowed'
              : 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 hover:scale-105 shadow-lg hover:shadow-xl'
          }`}
        >
          {isLoading ? (
            <span className="flex items-center justify-center">
              <div className="relative">
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/30"></div>
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent absolute top-0"></div>
              </div>
              <span className="ml-3">Processing...</span>
            </span>
          ) : (
            <span className="flex items-center justify-center">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
              Transcribe from URL
            </span>
          )}
        </button>
      </form>
    </div>
  );
}