// src/components/AudioUploader.tsx
'use client';

import { useState, useRef } from 'react';

interface AudioUploaderProps {
  onTranscriptionStart: () => void;
  onTranscriptionComplete: (result: any) => void;
  enableProgress?: boolean;
}

export default function AudioUploader({
  onTranscriptionStart,
  onTranscriptionComplete,
  enableProgress = false  // <- AGGIUNTO QUESTO PARAMETRO
}: AudioUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [useLocalProcessing, setUseLocalProcessing] = useState(true);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!file) {
      setError('Please select an audio file');
      return;
    }
    
    // Signal that transcription has started
    onTranscriptionStart();
    setError(null);
    
    try {  // <- CORRETTO: era "try: {"
      if (enableProgress && useLocalProcessing) {  // <- CORRETTO: era "(enableProgress"
        // Usa il progress tracking - passa i dati al parent
        console.log("Using progress tracking:", enableProgress, useLocalProcessing);
        const formData = new FormData();
        formData.append('audio', file);
        await onTranscriptionComplete(formData);
      } else {
        // Mantieni il comportamento originale
        const formData = new FormData();
        formData.append('audio', file);
        
        const endpoint = useLocalProcessing 
          ? '/api/transcribe/local' 
          : '/api/transcribe';
        
        const response = await fetch(endpoint, {
          method: 'POST',
          body: formData,
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to transcribe audio');
        }
        
        const data = await response.json();
        onTranscriptionComplete(data.text || data);
      }
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setFile(null);
    } catch (err) {
      console.error('Transcription error:', err);
      setError((err as Error).message || 'An error occurred during transcription');
      onTranscriptionComplete(''); // Reset transcription state
    }
  };

  return (
    <div className="w-full">
      {/* Modern Progress indicator */}
      {enableProgress && (
        <div className="mb-6 p-4 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100 rounded-xl shadow-sm">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="flex items-center justify-center w-8 h-8 bg-emerald-100 rounded-full">
                <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
            </div>
            <div className="ml-3">
              <p className="text-emerald-800 font-medium text-sm">Advanced Progress Tracking</p>
              <p className="text-emerald-600 text-xs">Real-time updates for your audio processing</p>
            </div>
          </div>
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-3">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-gray-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              Select Audio File
            </div>
          </label>
          
          <div className="relative">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="audio/*,video/*"
              className="w-full px-4 py-3 bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
            />
            {file && (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center">
                  <svg className="w-5 h-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm font-medium text-gray-700">{file.name}</span>
                  <span className="ml-auto text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                </div>
              </div>
            )}
          </div>
          
          <p className="mt-2 text-xs text-gray-500">
            Supported formats: MP3, WAV, M4A, FLAC, OGG, and more
          </p>
        </div>
        
        <div className="bg-gray-50 rounded-xl p-4">
          <div className="flex items-center">
            <input
              id="local-processing"
              type="checkbox"
              checked={useLocalProcessing}
              onChange={() => setUseLocalProcessing(!useLocalProcessing)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="local-processing" className="ml-3 block text-sm text-gray-700">
              <div className="font-medium">Use Local Processing</div>
              <div className="text-xs text-gray-500 mt-1">
                {enableProgress && useLocalProcessing && (
                  <span className="text-blue-600 font-medium flex items-center">
                    <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Real-time progress tracking enabled
                  </span>
                )}
                {!useLocalProcessing && (
                  <span className="text-gray-500">Progress tracking not available with cloud processing</span>
                )}
              </div>
            </label>
          </div>
        </div>
        
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-red-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-red-700 text-sm font-medium">{error}</span>
            </div>
          </div>
        )}
        
        <button
          type="submit"
          disabled={!file}
          className={`w-full py-4 px-6 rounded-xl font-semibold text-white transition-all duration-300 transform ${
            file
              ? 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 hover:scale-105 shadow-lg hover:shadow-xl'
              : 'bg-gray-300 cursor-not-allowed'
          }`}
        >
          <span className="flex items-center justify-center">
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            Transcribe Audio File
            {enableProgress && useLocalProcessing && <span className="ml-2 text-yellow-300">⚡</span>}
          </span>
        </button>
      </form>
    </div>
  );
}