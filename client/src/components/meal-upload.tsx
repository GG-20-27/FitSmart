import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMutation } from "@tanstack/react-query";
import { Upload, CloudUpload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface MealUploadProps {
  onUploadSuccess: () => void;
}

export function MealUpload({ onUploadSuccess }: MealUploadProps) {
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const { toast } = useToast();

  const uploadMutation = useMutation({
    mutationFn: async (files: FileList) => {
      const formData = new FormData();
      Array.from(files).forEach(file => {
        formData.append('meals', file);
      });

      const response = await fetch('/api/meals', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to upload meals');
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Upload successful",
        description: data.message,
      });
      setSelectedFiles(null);
      // Reset the input
      const input = document.getElementById('meal-upload') as HTMLInputElement;
      if (input) input.value = '';
      onUploadSuccess();
    },
    onError: (error) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedFiles(e.target.files);
  };

  const handleUpload = () => {
    if (selectedFiles && selectedFiles.length > 0) {
      uploadMutation.mutate(selectedFiles);
    }
  };

  const handleDropZoneClick = () => {
    document.getElementById('meal-upload')?.click();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Upload Meals</CardTitle>
        <p className="text-sm text-slate-600">Add meal images for today's nutrition tracking</p>
      </CardHeader>
      <CardContent>
        <div 
          className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-blue-500 transition-colors cursor-pointer"
          onClick={handleDropZoneClick}
        >
          <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center mx-auto mb-4">
            <CloudUpload className="h-6 w-6 text-blue-600" />
          </div>
          <p className="text-slate-900 font-medium mb-2">Click to upload meal images</p>
          <p className="text-sm text-slate-600">PNG, JPG up to 10MB each</p>
          <Input
            id="meal-upload"
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>
        
        {selectedFiles && selectedFiles.length > 0 && (
          <div className="mt-4 p-3 bg-slate-50 rounded-lg">
            <p className="text-sm text-slate-700 mb-2">
              Selected {selectedFiles.length} file(s):
            </p>
            <ul className="text-xs text-slate-600 space-y-1">
              {Array.from(selectedFiles).map((file, index) => (
                <li key={index} className="truncate">
                  {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)
                </li>
              ))}
            </ul>
          </div>
        )}
        
        <div className="mt-4">
          <Button 
            className="w-full bg-blue-600 hover:bg-blue-700" 
            onClick={handleUpload}
            disabled={!selectedFiles || selectedFiles.length === 0 || uploadMutation.isPending}
          >
            {uploadMutation.isPending ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload Selected Images
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
