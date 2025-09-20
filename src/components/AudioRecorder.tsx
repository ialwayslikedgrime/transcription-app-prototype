// src/components/AudioRecorder.tsx
'use client';

import { useState, useRef, useEffect } from 'react';

interface AudioRecorderProps {
  onTranscriptionStart: () => void;
  onTranscriptionComplete: (result: string) => void;
}

export default function AudioRecorder({ onTranscriptionStart, onTranscriptionComplete }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      // Clean up timer when component unmounts
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  // Format seconds into MM:SS display format
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const startRecording = async () => {
    chunksRef.current = [];
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };
      
      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/wav' });
        setAudioBlob(audioBlob);
        
        // Stop all audio tracks
        stream.getTracks().forEach(track => track.stop());
      };
      
      // Start recording
      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
      
    } catch (error) {
      console.error('Error accessing microphone:', error);
    }
  };
  
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      // Clear timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };
  
  const handleTranscribe = async () => {
    if (!audioBlob) return;
    
    try {
      // Notify parent component that transcription is starting
      onTranscriptionStart();
      
      // Show loading state
      setIsLoading(true);
      
      // Create form data with the recorded audio
      const formData = new FormData();
      formData.append('audio', audioBlob);
      
      // Send the audio to your backend API
      const response = await fetch('/api/transcribe/local', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error(`Transcription failed: ${response.status}`);
      }
      
      // Parse the response
      const data = await response.json();
      
      // Update the UI with the transcription
      if (data.success && data.text) {
        onTranscriptionComplete(data.text);
      } else {
        throw new Error(data.error || 'Transcription failed');
      }
      setIsLoading(false);
    } catch (error) {
      console.error('Error:', error);
      onTranscriptionComplete('Error: Could not transcribe audio. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* Recording Control */}
      <div className="text-center">
        {isRecording ? (
          <div className="space-y-4">
            <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-r from-red-500 to-pink-600 rounded-full shadow-lg animate-pulse">
              <div className="w-6 h-6 bg-white rounded-full"></div>
            </div>
            <div className="space-y-2">
              <p className="text-red-600 font-semibold text-lg">Recording in progress</p>
              <p className="text-3xl font-mono font-bold text-gray-800">{formatTime(recordingTime)}</p>
            </div>
            <button
              onClick={stopRecording}
              className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 text-white font-semibold rounded-xl transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9h6v6H9z" />
              </svg>
              Stop Recording
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full shadow-lg hover:shadow-xl transition-all duration-300">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <div className="space-y-2">
              <p className="text-gray-700 font-semibold">Ready to record</p>
              <p className="text-sm text-gray-500">Click the button below to start recording</p>
            </div>
            <button
              onClick={startRecording}
              className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold rounded-xl transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              disabled={!!audioBlob}
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
              Start Recording
            </button>
          </div>
        )}
      </div>
      
      {/* Audio Playback and Controls */}
      {audioBlob && !isRecording && (
        <div className="bg-gray-50 rounded-xl p-6 space-y-4">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-green-100 rounded-full mb-3">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-green-800 font-medium">Recording Complete!</p>
            <p className="text-sm text-gray-500">Listen to your recording and transcribe when ready</p>
          </div>
          
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <audio 
              src={URL.createObjectURL(audioBlob)} 
              controls 
              className="w-full h-12"
              style={{
                filter: 'sepia(20%) saturate(70%) hue-rotate(200deg) brightness(90%) contrast(90%)',
              }}
            />
          </div>
          
          <div className="flex space-x-3">
            <button
              onClick={() => setAudioBlob(null)}
              className="flex-1 px-4 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-xl transition-all duration-200"
            >
              <span className="flex items-center justify-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Record Again
              </span>
            </button>
            
            <button
              onClick={handleTranscribe}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold rounded-xl transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center justify-center">
                  <div className="relative">
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/30"></div>
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent absolute top-0"></div>
                  </div>
                  <span className="ml-2">Transcribing...</span>
                </span>
              ) : (
                <span className="flex items-center justify-center">
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                  Transcribe
                </span>
              )}
            </button>
          </div>
        </div>
      )}
      
      {/* Loading State */}
      {isLoading && (
        <div className="bg-white rounded-xl p-8 text-center shadow-sm">
          <div className="relative inline-flex mb-4">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200"></div>
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent absolute top-0"></div>
          </div>
          <p className="text-gray-700 font-medium">Processing your recording...</p>
          <p className="text-sm text-gray-500 mt-1">This may take a few moments</p>
        </div>
      )}
    </div>
  );
}