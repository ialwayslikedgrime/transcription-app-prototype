
'use client';

import { useState } from 'react';

export default function TranscriptionForm() {
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [transcription, setTranscription] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

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
    
    setIsLoading(true);
    setError(null);
    
    try {
      const formData = new FormData();
      formData.append('audio', file);
      
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to transcribe audio');
      }
      
      const data = await response.json();
      setTranscription(data);
    } catch (err) {
      console.error('Transcription error:', err);
      setError((err as Error).message || 'An error occurred during transcription');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 bg-white rounded-lg shadow-md">
      <h1 className="text-2xl font-bold mb-6">Audio Transcription</h1>
      
      <form onSubmit={handleSubmit} className="mb-6">
        <div className="mb-4">
          <label className="block text-gray-700 mb-2">
            Upload Audio File
          </label>
          <input
            type="file"
            onChange={handleFileChange}
            accept="audio/*,video/*"
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            disabled={isLoading}
          />
        </div>
        
        <button
          type="submit"
          disabled={!file || isLoading}
          className={`px-4 py-2 rounded-md ${
            !file || isLoading
              ? 'bg-gray-300 cursor-not-allowed'
              : 'bg-blue-500 hover:bg-blue-600 text-white'
          }`}
        >
          {isLoading ? 'Transcribing...' : 'Transcribe Audio'}
        </button>
      </form>
      
      {error && (
        <div className="mb-6 p-4 bg-red-100 border-l-4 border-red-500 text-red-700">
          <p>{error}</p>
        </div>
      )}
      
      {transcription && (
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-4">Transcription Result</h2>
          
          <div className="mb-6">
            <h3 className="font-medium mb-2">Full Text</h3>
            <div className="p-4 bg-gray-50 rounded-md border border-gray-200">
              {transcription.text}
            </div>
          </div>
          
          {transcription.chunks && transcription.chunks.length > 0 && (
            <div>
              <h3 className="font-medium mb-2">Segments</h3>
              <div className="divide-y divide-gray-200">
                {transcription.chunks.map((chunk: any, index: number) => (
                  <div 
                    key={index} 
                    className="py-2 hover:bg-gray-50 cursor-pointer"
                    onClick={() => {
                      // You can add functionality to play this segment
                      console.log(`Play segment from ${chunk.start} to ${chunk.end}`);
                    }}
                  >
                    <div className="text-sm text-gray-500 mb-1">
                      [{formatTime(chunk.start)} - {formatTime(chunk.end)}]
                    </div>
                    <div>{chunk.text}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <div className="mt-4 text-sm text-gray-600">
            Processing time: {transcription.processing_time.toFixed(2)} seconds
          </div>
        </div>
      )}
    </div>
  );
}

// Helper function to format time in MM:SS.ms format
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}