"use client";

import { useRef, useState } from "react";

import { savePhotoAction } from "../app/moi/actions";

export type PhotoUploadProps = Readonly<{ photoUrl: string | null }>;

/*
 * Téléversement de la photo de profil : le fichier est lu en data URL côté
 * navigateur, puis envoyé seul au serveur (`savePhotoAction`), qui ne touche pas
 * au reste du profil.
 */
export const PhotoUpload = ({ photoUrl }: PhotoUploadProps) => {
  const [preview, setPreview] = useState<string | null>(photoUrl);
  const inputRef = useRef<HTMLInputElement>(null);

  const onFile = (file: File | undefined): void => {
    if (file === undefined) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      setPreview(dataUrl);
      void savePhotoAction(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="photo-upload">
      <span className="photo-upload-preview">
        {preview !== null && preview !== "" ? (
          <img src={preview} alt="Photo de profil" className="photo-upload-img" />
        ) : (
          <span className="photo-upload-placeholder">Aucune photo</span>
        )}
      </span>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => onFile(event.target.files?.[0])}
      />

      <button
        type="button"
        className="photo-upload-button"
        onClick={() => inputRef.current?.click()}
      >
        {preview !== null && preview !== "" ? "Changer la photo" : "Ajouter une photo"}
      </button>

      {preview !== null && preview !== "" ? (
        <button
          type="button"
          className="photo-upload-remove"
          onClick={() => {
            setPreview(null);
            void savePhotoAction("");
          }}
        >
          Supprimer
        </button>
      ) : null}
    </div>
  );
};
