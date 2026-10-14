import { ShinyButton } from "@/components/ui/shiny-button";

export default function ShinyButtonDemo() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black">
      <ShinyButton onClick={() => console.log("clicked")}>Get Started</ShinyButton>
    </div>
  );
}
