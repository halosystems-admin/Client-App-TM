export function streamScribeNote(
  transcript: string,
  templateId: string,
  patientId: string,
  consultationId: string,
  practiceId: string,
  onChunk: (accumulated: string) => void,
  onOutputId?: (outputId: string) => void
): Promise<string>;

export default streamScribeNote;