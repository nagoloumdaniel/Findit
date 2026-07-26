-- La zone de doute de la deduplication devient stockable : REVIEW groupe deux
-- offres sans les fusionner, en attendant un controle. Purement additif.

ALTER TYPE "DuplicateAction" ADD VALUE 'REVIEW';
