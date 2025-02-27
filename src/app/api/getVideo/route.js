import { TranscribeClient, StartTranscriptionJobCommand, GetTranscriptionJobCommand } from "@aws-sdk/client-transcribe";
import { NextResponse } from "next/server";

const client = new TranscribeClient({
    region: 'ap-south-1',
    credentials: {
        accessKeyId: process.env.AccessKey,
        secretAccessKey: process.env.SecretKey
    }
});

async function checkTranscriptionJobStatus(jobName) {
    const command = new GetTranscriptionJobCommand({ TranscriptionJobName: jobName });
    try {
        const data = await client.send(command);
        return data.TranscriptionJob;
    } catch (err) {
        if (err.name === 'NotFoundException') {
            return null;
        }
        throw new Error(`Failed to get transcription job status: ${err.message}`);
    }
}

async function startTranscriptionJob(jobName) {
    const command = new StartTranscriptionJobCommand({
        TranscriptionJobName: jobName,
        OutputBucketName: process.env.BucketName,
        OutputKey: `${jobName}.transcription`,
        IdentifyLanguage: true,
        Media: {
            MediaFileUri: `s3://${process.env.BucketName}/${jobName}`,
        }
    });
    try {
        const data = await client.send(command);
        return data.TranscriptionJob;
    } catch (err) {
        throw new Error(`Failed to start transcription job: ${err.message}`);
    }
}

async function getTranscript(transcriptUri) {
    try {
        const res = await fetch(transcriptUri);
        if (!res.ok) {
            throw new Error(`Failed to fetch transcript: ${res.statusText}`);
        }
        const transcript = await res.json();
        return transcript;
        // return transcript.results.items;
    } catch (err) {
        throw new Error(`Failed to get transcript: ${err.message}`);
    }
}

export async function GET(req) {
    const url = new URL(req.url);
    const searchParams = new URLSearchParams(url.searchParams);
    const filename = searchParams.get('filename');
    try {
        let transcriptionJob = await checkTranscriptionJobStatus(filename);

        if (!transcriptionJob || transcriptionJob.TranscriptionJobStatus === 'FAILED') {
            transcriptionJob = await startTranscriptionJob(filename);
        }

        while (transcriptionJob.TranscriptionJobStatus === 'IN_PROGRESS') {
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for 5 seconds
            transcriptionJob = await checkTranscriptionJobStatus(filename);
        }

        if (transcriptionJob.TranscriptionJobStatus === 'COMPLETED') {
            const transcript = await getTranscript(transcriptionJob.Transcript.TranscriptFileUri);
            return NextResponse.json({ success: true, message: transcript }, { status: 200 });
        }

        throw new Error('Transcription job not completed');
    } catch (err) {
        console.error(err);
        return NextResponse.json({ success: false, message: `Internal Server Error: ${err.message}` }, { status: 500 });
    }
}
