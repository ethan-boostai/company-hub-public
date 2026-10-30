import { notFound } from "next/navigation";

// Any hub address with no page of its own shows the hub's not-found page (with the header and menu)
// instead of the bare default one.
export default function Missing() {
  notFound();
}
