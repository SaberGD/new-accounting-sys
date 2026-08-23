
import { 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  serverTimestamp,
  arrayUnion,
  getDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { Complaint, ComplaintLog, ComplaintStatus } from '../types';
import { getCorrectISOString } from './timeService';

export const createComplaint = async (complaint: Omit<Complaint, 'id' | 'createdAt' | 'history'>) => {
  const complaintsRef = collection(db, 'complaints');
  const docRef = await addDoc(complaintsRef, {
    ...complaint,
    createdAt: serverTimestamp(),
    history: []
  });
  return docRef.id;
};

export const updateComplaint = async (complaintId: string, updates: Partial<Complaint>) => {
  const complaintRef = doc(db, 'complaints', complaintId);
  await updateDoc(complaintRef, {
    ...updates,
    updatedAt: serverTimestamp()
  });
};


export const addComplaintLog = async (complaintId: string, log: ComplaintLog) => {
  const complaintRef = doc(db, 'complaints', complaintId);
  await updateDoc(complaintRef, {
    history: arrayUnion({
      ...log,
      timestamp: getCorrectISOString()
    }),
    lastUpdateSentToWhatsapp: log.updateSentToWhatsapp || false
  });
};

export const getAllComplaints = async () => {
  const complaintsRef = collection(db, 'complaints');
  const q = query(complaintsRef, orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Complaint));
};

export const addCustomerGeneralNote = async (customerId: string, note: { text: string, uid: string, name: string }) => {
  const notesRef = collection(db, 'customer_notes');
  await addDoc(notesRef, {
    customerId,
    ...note,
    timestamp: serverTimestamp()
  });
};

export const getCustomerNotes = async (customerId: string) => {
  const notesRef = collection(db, 'customer_notes');
  const q = query(notesRef, where('customerId', '==', customerId), orderBy('timestamp', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};
