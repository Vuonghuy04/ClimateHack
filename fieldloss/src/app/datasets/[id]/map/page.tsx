import { Suspense } from "react";
import { MappingPlaceholderScreen } from "@/components/mapping-placeholder-screen";
export default function MapColumnsPage() { return <Suspense fallback={<p className="loading">Opening imported records…</p>}><MappingPlaceholderScreen /></Suspense>; }
