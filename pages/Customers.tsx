
import React, { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { genericGet, genericGetQuery, genericGetPaginated, softDeleteDoc } from '../services/firestore';
import { Customer, Booking, SalesStaff } from '../types';
import { collection, query, where, getDocs, orderBy, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import * as XLSX from 'xlsx';
import DeleteModal from '../components/DeleteModal';

const Customers: React.FC = () => {
  const { t } = useTheme();
  const { effectiveProfile, hasPermission } = useAuth();
  const userProfile = effectiveProfile;
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [salesStaff, setSalesStaff] = useState<SalesStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerNotes, setCustomerNotes] = useState<any[]>([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteName, setDeleteName] = useState('');

  const fetchNotes = async (customerId: string) => {
    const notesRef = collection(db, 'customer_notes');
    const q = query(notesRef, where('customerId', '==', customerId), orderBy('timestamp', 'desc'));
    const snap = await getDocs(q);
    setCustomerNotes(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  };

  const handleAddNote = async () => {
    if (!selectedCustomerId || !newNoteText || !userProfile) return;
    const notesRef = collection(db, 'customer_notes');
    await addDoc(notesRef, {
      customerId: selectedCustomerId,
      text: newNoteText,
      uid: userProfile.uid,
      name: userProfile.displayName,
      timestamp: serverTimestamp()
    });
    setNewNoteText('');
    fetchNotes(selectedCustomerId);
  };

  const openNotes = (customer: Customer) => {
    setSelectedCustomerId(customer.id);
    setDeleteName(customer.name); // Using for title
    fetchNotes(customer.id);
    setIsNotesModalOpen(true);
  };

  const [lastDoc, setLastDoc] = useState<any>(null);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);

  const fetchData = async (isLoadMore = false) => {
    if (isLoadMore) {
      if (!lastDoc || loadingMore) return;
      setLoadingMore(true);
      try {
        const paginatedC = await genericGetPaginated<Customer>('customers', 25, lastDoc, [where('isDeleted', '!=', true)]);
        setCustomers(prev => [...prev, ...paginatedC.data.filter(x => !x.isDeleted)]);
        setLastDoc(paginatedC.lastDoc);
        setHasMore(paginatedC.data.length >= 25);
      } catch (err) {
        console.error("Error loading more customers:", err);
      } finally {
        setLoadingMore(false);
      }
    } else {
      setLoading(true);
      try {
        const [paginatedC, s] = await Promise.all([
          genericGetPaginated<Customer>('customers', 25, null, [where('isDeleted', '!=', true)]),
          genericGet<SalesStaff>('sales_staff')
        ]);
        setCustomers(paginatedC.data.filter(x => !x.isDeleted));
        setLastDoc(paginatedC.lastDoc);
        setHasMore(paginatedC.data.length >= 25);
        setSalesStaff(s);

        // If sales representative without viewAllBookings, query only their bookings
        if (!hasPermission('viewAllBookings') && userProfile) {
          const linkedStaff = s.find(staff => staff.userId === userProfile.uid);
          if (linkedStaff) {
            const userBookings = await genericGetQuery<Booking>('bookings', [where('salesId', '==', linkedStaff.id)]);
            setBookings(userBookings);
          }
        }
      } catch (err) {
        console.error("Error fetching customers:", err);
      } finally {
        setLoading(false);
      }
    }
  };

  useEffect(() => { fetchData(); }, []);

  const filteredCustomers = useMemo(() => {
    let list = customers.filter(c => 
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      c.whatsapp.includes(searchQuery) ||
      (c.fullWhatsapp && c.fullWhatsapp.includes(searchQuery)) ||
      c.phone.includes(searchQuery)
    );

    if (!hasPermission('viewAllBookings')) {
      const linkedStaff = salesStaff.find(s => s.userId === userProfile?.uid);
      if (linkedStaff) {
        // Find customers who have at least one booking with this sales staff
        const salesCustomerIds = new Set(
          bookings
            .filter(b => b.salesId === linkedStaff.id)
            .map(b => b.customerId)
        );
        list = list.filter(c => salesCustomerIds.has(c.id));
      } else {
        return []; // If not linked, show nothing for sales role
      }
    }

    return list;
  }, [customers, searchQuery, userProfile, salesStaff, bookings]);

  const exportToExcel = () => {
    const data = filteredCustomers.map(c => ({
      'Full Name': c.name,
      'Country Code': c.countryCode || '+20',
      'WhatsApp Number': c.whatsapp,
      'Full International Number': c.fullWhatsapp || `${c.countryCode || '+20'}${c.whatsapp}`,
      'Alt Phone': c.phone || 'N/A',
      'Email': c.email || 'N/A'
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Customers");
    const date = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `SG_Customers_Report_${date}.xlsx`);
  };

  const exportToVCF = () => {
    const vcardString = filteredCustomers.map(c => {
      const fullNum = c.fullWhatsapp || `${c.countryCode || '+20'}${c.whatsapp}`;
      let vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${c.name}\nTEL;TYPE=CELL,VOICE:${fullNum}`;
      if (c.phone && c.phone !== c.whatsapp) vcard += `\nTEL;TYPE=HOME,VOICE:${c.phone}`;
      if (c.email) vcard += `\nEMAIL:${c.email}`;
      vcard += `\nEND:VCARD`;
      return vcard;
    }).join('\n');

    const blob = new Blob([vcardString], { type: 'text/vcard' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const date = new Date().toISOString().split('T')[0];
    link.setAttribute('download', `SG_Contacts_${date}.vcf`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDelete = async () => {
    if (deleteId) {
      await softDeleteDoc('customers', deleteId, userProfile?.uid || '');
      setDeleteId(null);
      fetchData();
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
            <h1 className="text-2xl font-bold">{t('customers')}</h1>
            <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Directory: {filteredCustomers.length} unique contacts</p>
        </div>
        <div className="flex gap-2">
          {hasPermission('viewExports') && (
            <>
              <button 
                onClick={exportToExcel}
                className="bg-green-600 text-white px-4 py-2 rounded-lg font-bold shadow-lg shadow-green-500/30 flex items-center"
              >
                <i className="fas fa-file-excel mr-2 rtl:ml-2"></i> {t('exportExcel')}
              </button>
              <button 
                onClick={exportToVCF}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold shadow-lg shadow-blue-500/30 flex items-center"
              >
                <i className="fas fa-id-card mr-2 rtl:ml-2"></i> {t('exportVcf')}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="mb-6 relative max-w-md">
        <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
        <input 
          type="text" 
          placeholder={t('search')} 
          className="w-full pl-12 pr-4 py-3 bg-white dark:bg-gray-800 border-none rounded-2xl shadow-sm outline-none font-medium" 
          value={searchQuery} 
          onChange={e => setSearchQuery(e.target.value)} 
        />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden overflow-x-auto">
        <table className="w-full text-left rtl:text-right">
          <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-400">
            <tr>
              <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest">{t('name')}</th>
              <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest">{t('whatsapp')}</th>
              <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest">{t('phone')}</th>
              <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest">{t('email')}</th>
              <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-gray-700">
            {filteredCustomers.map(c => (
              <tr key={c.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-colors">
                <td className="px-6 py-4 font-bold text-sm">{c.name}</td>
                <td className="px-6 py-4 text-xs font-medium text-primary-600">
                    <span className="opacity-40 mr-1">{c.countryCode || '+20'}</span>
                    <span className="font-bold">{c.whatsapp}</span>
                </td>
                <td className="px-6 py-4 text-xs text-gray-500">{c.phone || '-'}</td>
                <td className="px-6 py-4 text-xs text-gray-500">{c.email || '-'}</td>
                <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                        <button 
                            onClick={() => openNotes(c)}
                            className="flex flex-col items-center justify-center p-2 text-primary-600 hover:text-primary-800 transition-colors"
                        >
                            <span className="text-[7px] font-black uppercase mb-1">{t('history')}</span>
                            <i className="fas fa-history"></i>
                        </button>
                        {hasPermission('deleteRecords') && (
                            <button onClick={() => { setDeleteId(c.id); setDeleteName(c.name); }} className="flex flex-col items-center justify-center p-2 text-gray-300 hover:text-red-600 transition-colors">
                                <span className="text-[7px] font-black uppercase mb-1">{t('delete')}</span>
                                <i className="fas fa-trash-alt"></i>
                            </button>
                        )}
                    </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredCustomers.length === 0 && !loading && (
          <div className="py-20 text-center text-gray-400 italic font-bold">No customers found.</div>
        )}
        {hasMore && !searchQuery && (
          <div className="p-4 border-t dark:border-gray-700 flex justify-center bg-gray-50/50 dark:bg-gray-800">
            <button
              onClick={() => fetchData(true)}
              disabled={loadingMore}
              className="px-6 py-2.5 bg-gray-900 dark:bg-gray-700 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-black transition-all shadow-md flex items-center gap-2 disabled:opacity-50"
            >
              {loadingMore ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-plus"></i>}
              {loadingMore ? 'Loading More...' : 'Load More Customers'}
            </button>
          </div>
        )}
      </div>

      <DeleteModal isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} itemName={deleteName} />

      {/* Customer Notes Modal */}
      {isNotesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-lg max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
            <div className="p-6 border-b dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/20">
              <div>
                <h2 className="text-xl font-black dark:text-white uppercase tracking-tight">{t('customerUpdates')}</h2>
                <p className="text-xs text-primary-600 font-bold">{deleteName}</p>
              </div>
              <button 
                onClick={() => setIsNotesModalOpen(false)}
                className="p-3 bg-white dark:bg-gray-700 rounded-2xl shadow-sm hover:text-red-500 transition-colors"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
              <div className="space-y-4">
                {customerNotes.length === 0 ? (
                  <div className="text-center py-10 text-gray-400 italic text-sm">No notes yet.</div>
                ) : (
                  customerNotes.map(n => (
                    <div key={n.id} className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border dark:border-gray-700">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] font-black dark:text-white uppercase">{n.name}</span>
                        <span className="text-[10px] text-gray-400 font-bold">
                          {n.timestamp?.toDate ? n.timestamp.toDate().toLocaleString() : 'Just now'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{n.text}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="p-6 border-t dark:border-gray-700 bg-white dark:bg-gray-800 space-y-3">
              <textarea 
                placeholder="Record a general update or note about this customer..."
                className="w-full p-3 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none focus:ring-2 focus:ring-primary-500 text-sm dark:text-white h-24 resize-none"
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
              />
              <div className="flex justify-end">
                <button 
                  onClick={handleAddNote}
                  disabled={!newNoteText}
                  className="bg-primary-600 text-white px-8 py-2 rounded-xl font-black shadow-lg shadow-primary-500/30 hover:bg-primary-700 transition-colors disabled:opacity-50"
                >
                  {t('save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Customers;
