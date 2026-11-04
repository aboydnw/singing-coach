export function checkActivityAudio(
  catalogue: {
    activities?: Array<{
      id: string;
      reference_audio?: Array<Record<string, unknown>>;
    }>;
  },
  projectRoot?: string,
): string[];
