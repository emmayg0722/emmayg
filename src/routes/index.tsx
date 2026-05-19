import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "emmayg" },
      {
        name: "description",
        content:
          "Apple-inspired AI hub, AI compass, AI playbook, project portfolio, and professional profile for Emma Yu Gao.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <iframe
      src="/portfolio.html"
      title="emmayg"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        border: 0,
      }}
    />
  );
}
