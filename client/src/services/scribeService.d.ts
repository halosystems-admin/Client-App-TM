export function streamScribeNote(
  transcript: string,
  templateId: string,
  patientId: string,
  consultationId: string,
  practiceId: string,
  onChunk: (chunk: string) => void,
  onOutputId?: (outputId: string) => void
): Promise<void>;

export default streamScribeNote;