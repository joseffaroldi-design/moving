"use client";

import { Camera, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/ui/empty-state";

export default function MobilePhotosPage() {
  const toast = useToast();
  return (
    <div>
      <h1 className="mb-4 font-heading text-xl font-bold text-navy">Job Photos</h1>
      <EmptyState
        icon={Camera}
        title="No photos yet"
        description="Capture before/after photos and damage documentation for the current job."
      />
      <Button
        variant="navy"
        size="lg"
        className="mt-4 w-full py-4 text-base"
        onClick={() => toast("Photo upload uses register-job-photo (auth required).", "info")}
        data-testid="upload-photo-button"
      >
        <Upload className="h-5 w-5" /> Upload Photo
      </Button>
    </div>
  );
}
