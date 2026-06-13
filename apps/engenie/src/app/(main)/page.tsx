import { redirect } from "next/navigation";

// The internal full-page Ask experience is EnGenie's home.
export default function Home() {
  redirect("/ask");
}
