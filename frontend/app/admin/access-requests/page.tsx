import type { Metadata } from "next";
import PageClient from "./PageClient";

/**
 * The desk's review screen for promoter-dataset access requests.
 *
 * Reached only from a signed link in the notification email — there is no
 * login here and nothing links to it, so it must never be indexed. It renders
 * two ways: with `?id=` it is one request and a confirm button, without it is
 * the whole queue (George, 2026-09-24: "do button add kar do ... admin ko data
 * list nahi hai abhi?" — both halves of that).
 */
export const metadata: Metadata = {
  title: "Access requests",
  robots: { index: false, follow: false, nocache: true },
};

export default function Page() {
  return <PageClient />;
}
