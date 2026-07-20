import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";

export type KnowledgeRecord = {
  id: string;
  title: string;
  content: string;
  sentence?: string;
  tags: string[];
  createdAt?: string;
};

type AddKnowledgeInput = {
  title: string;
  content: string;
  tags: string[];
  sentence?: string;
};

function normalize(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ");
}

function keywords(text: string) {
  return Array.from(
    new Set(
      normalize(text)
        .split(/\s+/)
        .map((word) => word.trim())
        .filter((word) => word.length >= 2)
        .slice(0, 30),
    ),
  );
}

function mapDoc(doc: FirebaseFirestore.QueryDocumentSnapshot): KnowledgeRecord {
  const data = doc.data();
  const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : undefined;
  return {
    id: doc.id,
    title: String(data.title || ""),
    content: String(data.content || ""),
    sentence: data.sentence ? String(data.sentence) : undefined,
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    createdAt,
  };
}

export async function listKnowledge(limit = 12) {
  const snapshot = await getAdminDb().collection("jarvis_knowledge").orderBy("createdAt", "desc").limit(limit).get();
  return snapshot.docs.map(mapDoc);
}

export async function addKnowledge(input: AddKnowledgeInput) {
  const sentence = input.sentence?.trim() || `บันทึกว่า ${input.title.trim()} : ${input.content.trim()}`;
  const searchTerms = keywords(`${input.title} ${input.content} ${input.tags.join(" ")} ${sentence}`);
  const doc = await getAdminDb().collection("jarvis_knowledge").add({
    title: input.title.trim(),
    content: input.content.trim(),
    sentence,
    tags: input.tags,
    searchTerms,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {
    id: doc.id,
    title: input.title.trim(),
    content: input.content.trim(),
    sentence,
    tags: input.tags,
  };
}

export async function searchKnowledge(query: string, limit = 6) {
  const terms = keywords(query).slice(0, 10);
  if (!terms.length) return [];

  const snapshot = await getAdminDb()
    .collection("jarvis_knowledge")
    .where("searchTerms", "array-contains-any", terms)
    .limit(limit)
    .get();

  return snapshot.docs.map(mapDoc);
}
