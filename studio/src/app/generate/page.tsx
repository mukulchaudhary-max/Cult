import GenerateStudio from "@/components/GenerateStudio";

export const metadata = {
  title: "Studio — Cult Studio",
};

export default async function GeneratePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const get = (key: string) => {
    const v = params[key];
    return Array.isArray(v) ? v[0] : v;
  };

  return (
    <GenerateStudio
      initialPrompt={get("prompt")}
      initialGenre={get("genre")}
      initialCameraMove={get("cameraMove")}
      initialAspectRatio={get("aspectRatio")}
    />
  );
}
