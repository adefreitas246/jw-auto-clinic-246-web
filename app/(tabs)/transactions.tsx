import { useAuth } from '@/context/AuthContext';
import { Ionicons } from "@expo/vector-icons";
import { Asset } from 'expo-asset';
import * as FileSystem from "expo-file-system/legacy";
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView, Modal, Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions
} from "react-native";
import * as Animatable from 'react-native-animatable';
import DropDownPicker from 'react-native-dropdown-picker';

interface Transaction {
  _id: string;
  serviceType?: string; 
  serviceName?: string;
  specialsName?: string;
  finalPrice?: number;
  originalPrice?: number;
  discountPercent?: number;
  discountAmount?: number;
  paymentMethod?: string;
  customerName?: string;
  email?: string;
  vehicleDetails?: string;
  createdAt?: string;
}

type TransactionItem = {
  serviceTypeId?: string | null;
  serviceType?: string;
  serviceName?: string;
  specialsId?: string | null;
  specialsName?: string | null;
  originalPrice?: number;
  discountPercent?: number;
  discountAmount?: number;
  finalPrice?: number;
  paymentMethod?: string;
  notes?: string | null;
};

type TransactionDetail = {
  _id: string;
  customerName?: string;
  email?: string;
  vehicleDetails?: string;
  createdAt?: string;
  // If your API flattens (single item):
  serviceType?: string;
  serviceName?: string;
  specialsName?: string | null;
  originalPrice?: number;
  discountPercent?: number;
  discountAmount?: number;
  finalPrice?: number;
  paymentMethod?: string;
  notes?: string;
  // If your API groups (multi items):
  items?: TransactionItem[];
  receiptPdfBase64?: string; // optional, if stored server-side
  receiptFileName?: string;
};

export default function TransactionsScreen() {
  const { user } = useAuth();

  // Permissions / flags
  const canManage = user?.role === 'admin';

  // ======= Transactions speed-dial =======
  const [txFabOpen, setTxFabOpen] = useState(false);

  // ======= Manage Services modal visibility =======
  const [manageOpen, setManageOpen] = useState(false);

  // Sticky header elevation on scroll (matches Settings)
  const [headerElevated, setHeaderElevated] = useState(false);

  const StickyTxHeader = useMemo(
    () => (
      <View style={[styles.stickyHeader, headerElevated && styles.stickyHeaderElevated]}>
        <Text style={styles.stickyHeaderTitle}>Transactions</Text>
        <Text style={styles.stickyHeaderSubtitle}>Recent activity</Text>
      </View>
    ),
    [headerElevated]
  );

  // Transactions list state + pagination
  const [tx, setTx] = useState<Transaction[]>([]);
  const [loadingTx, setLoadingTx] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);

  const fetchTransactions = async (initial = false) => {
    if (!user?.token) return;
    setLoadingTx(true);
    try {
      const url = new URL("https://jw-auto-clinic-246.onrender.com/api/transactions");
      url.searchParams.set("limit", "25");
      if (!initial && cursor) url.searchParams.set("cursor", cursor);

      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${user.token}` } });
      const data = await res.json();

      if (Array.isArray(data)) {
        setTx(prev => (initial ? data : [...prev, ...data]));
        setCursor(null);
      } else if (data?.items) {
        setTx(prev => (initial ? data.items : [...prev, ...data.items]));
        setCursor(data.nextCursor || null);
      } else {
        if (initial) setTx([]);
        setCursor(null);
      }
    } catch (e) {
      // console.warn('fetchTransactions error:', e);
    } finally {
      setLoadingTx(false);
    }
  };

  // Fetch transactions on mount
  useEffect(() => {
    fetchTransactions(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------- Transaction details modal --------
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<TransactionDetail | null>(null);

  const openTransactionDetails = async (id: string) => {
    if (!user?.token) return;
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const res = await fetch(`https://jw-auto-clinic-246.onrender.com/api/transactions/${id}`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      const data = await res.json();
      const got: TransactionDetail = data && typeof data === 'object'
        ? data
        : { _id: id };
      setDetail(got);
    } catch (e) {
      // console.warn('fetch transaction detail error:', e);
      const fromList = tx.find(t => t._id === id);
      if (fromList) {
        setDetail({
          _id: fromList._id,
          customerName: fromList.customerName,
          email: fromList.email,
          vehicleDetails: fromList.vehicleDetails,
          createdAt: fromList.createdAt,
          serviceType: fromList.serviceType,
          serviceName: fromList.serviceName,
          specialsName: fromList.specialsName,
          originalPrice: fromList.originalPrice,
          discountPercent: fromList.discountPercent,
          discountAmount: fromList.discountAmount,
          finalPrice: fromList.finalPrice,
          paymentMethod: fromList.paymentMethod,
        });
      } else {
        setDetail({_id: id});
      }
    } finally {
      setDetailLoading(false);
    }
  };
  

  const closeTransactionDetails = () => {
    setDetailOpen(false);
    setDetail(null);
    setDetailLoading(false);
  };

  // ----- helpers to compute from detail and share -----
  const isMulti = (d?: TransactionDetail | null) => !!(d?.items && d.items.length);

  const detailTotals = (d: TransactionDetail | null) => {
    if (!d) return { subtotal: 0, totalDiscount: 0, total: 0 };
    if (isMulti(d)) {
      const subtotal = d.items!.reduce((s, i) => s + Number(i.originalPrice || 0), 0);
      const totalDiscount = d.items!.reduce((s, i) => {
        const pct = Number(i.discountPercent || 0) / 100;
        const fromPct = (Number(i.originalPrice || 0) * pct) || 0;
        return s + (Number(i.discountAmount || 0) || fromPct || 0);
      }, 0);
      const total = d.items!.reduce((s, i) => {
        const pct = Number(i.discountPercent || 0) / 100;
        const fromPct = (Number(i.originalPrice || 0) * pct) || 0;
        const discAmt = Number(i.discountAmount || 0) || fromPct || 0;
        const final = Math.max(0, Number(i.originalPrice || 0) - discAmt);
        return s + final;
      }, 0);
      return { subtotal, totalDiscount, total };
    }
    // single
    const op = Number(d.originalPrice || 0);
    const dp = Number(d.discountPercent || 0) / 100;
    const dAmt = Number(d.discountAmount || (op * dp) || 0);
    const total = Math.max(0, op - dAmt);
    return { subtotal: op, totalDiscount: dAmt, total };
  };

  const buildItemsText = (items: TransactionItem[]) =>
    items.map((i, idx) => {
      const op = Number(i.originalPrice || 0);
      const pct = Number(i.discountPercent || 0);
      const dAmt = Number(i.discountAmount || (op * (pct / 100)) || 0);
      const final = Math.max(0, op - dAmt);
      return `${idx + 1}. ${i.serviceType || i.serviceName || 'Service'}${i.specialsName ? ` (${i.specialsName})` : ''} - $${op.toFixed(2)} - ${pct}% → $${final.toFixed(2)} [${i.paymentMethod || 'Cash'}]`;
    }).join('\n');

  const shareBase64Pdf = async (base64DataUriOrRaw: string, fileName?: string) => {
    try {
      let raw = base64DataUriOrRaw;
      const prefix = 'base64,';
      const idx = base64DataUriOrRaw.indexOf(prefix);
      if (idx !== -1) raw = base64DataUriOrRaw.slice(idx + prefix.length);

      const baseDir =
        (FileSystem as any).Directory ??
        (FileSystem as any).cacheDirectory ??
        '';

      if (!baseDir) throw new Error('No writable directory available on this platform.');

      const normalized = baseDir.endsWith('/') ? baseDir : baseDir + '/';
      const path = `${normalized}${fileName || `Receipt-${Date.now()}.pdf`}`;

      await FileSystem.writeAsStringAsync(path, raw, { encoding: FileSystem.EncodingType.Base64 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { UTI: 'com.adobe.pdf', mimeType: 'application/pdf' });
      } else {
        Alert.alert('Receipt ready', `PDF saved at:\n${path}`);
      }
    } catch (e: any) {
      Alert.alert('Share failed', e?.message || 'Could not share the receipt PDF.');
    }
  };

  const rebuildAndShareReceiptFromDetail = async (d: TransactionDetail | null) => {
    if (!d) return;

    const multi = isMulti(d);
    const totals = detailTotals(d);
    const customerName = d.customerName || 'Customer';
    const email = d.email || '';
    const vehicleDetails = d.vehicleDetails || '';
    const employeeName = 'JW Auto Clinic 246';

    if (!multi) {
      const service = d.serviceType || d.serviceName || 'Service';
      const specials = d.specialsName || '';
      const paymentMethod = d.paymentMethod || 'Cash';
      const op = Number(d.originalPrice) || 0;
      const dpNum = Number(d.discountPercent) || 0;
      const daNumRaw = Number(d.discountAmount) || 0;
      const dAmtNum = daNumRaw > 0 ? daNumRaw : +(op * (dpNum / 100)).toFixed(2);
      const finalNum = Number.isFinite(Number(d.finalPrice))
      ? Number(d.finalPrice)
      : +(Math.max(0, op - dAmtNum)).toFixed(2);
      const originalPrice = op.toFixed(2);
      const dp = String(dpNum);
      const dAmt = dAmtNum.toFixed(2);
      const final = finalNum.toFixed(2);
      const notes = d.notes || ''; 

      await generateAndShareReceipt({
        customerName,
        vehicleDetails,
        email,
        employeeName,
        serviceType: service,
        specials,
        paymentMethod,
        originalPrice,
        discountPercent: dp,
        discountAmount: dAmt,
        finalPrice: final,
        notes,
      });
      return;
    }

    const preview = buildDetailCombinedPreview(d.items!);
    const serviceLabel = `Multiple services (${d.items!.length})${preview ? ` – ${preview}` : ""}`; 

    const lines = buildItemsText(d.items!);
    await generateAndShareReceipt({
      customerName,
      vehicleDetails,
      email,
      employeeName,
      serviceType: serviceLabel,
      specials: '',
      paymentMethod: 'Mixed',
      originalPrice: totals.subtotal.toFixed(2),
      discountPercent: '',
      discountAmount: totals.totalDiscount.toFixed(2),
      finalPrice: totals.total.toFixed(2),
      notes: `Items:\n${lines}\n\nGrand Total: $${totals.total.toFixed(2)}`,
    });
  };

  // -------- Form modal (Add Transaction)
  const [formOpen, setFormOpen] = useState(false);
  const openForm = () => { clearForm(true); setFormOpen(true); };
  const closeForm = () => setFormOpen(false);

  // POS form state
  const [paymentMethod, setPaymentMethod] = useState('');
  const [openService, setOpenService] = useState(false);
  const [openPayment, setOpenPayment] = useState(false);
  const [openSpecials, setOpenSpecials] = useState(false);

  const [originalPrice, setOriginalPrice] = useState('');
  const [discountAmount, setDiscountAmount] = useState('');
  const [finalPrice, setFinalPrice] = useState('');
  const [vehicleDetails, setVehicleDetails] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [email, setEmail] = useState('');
  const [discountPercent, setDiscountPercent] = useState('');
  const [notes, setNotes] = useState('');

  const [newService, setNewService] = useState('');
  const [newSpecial, setNewSpecial] = useState('');
  const [newServicePrice, setNewServicePrice] = useState('');
  const [newSpecialPrice, setNewSpecialPrice] = useState('');

  const [cartModalVisible, setCartModalVisible] = useState(false);

  const { width, height } = useWindowDimensions();
  const shortestSide = Math.min(width, height);
  const isTablet = shortestSide >= 768;
  const isWide = isTablet; // only true on tablet, portrait or landscape

  // Email helper
  const isValidEmail = (s?: string | null) => !!s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());


  // Derive context from cart + form
  const deriveSubmissionContext = () => {
    const allEmails = [email, ...cart.map((i) => i.email)].map((e) => (e || '').trim()).filter(Boolean);
    const counts: Record<string, number> = {};
    for (const e of allEmails) if (isValidEmail(e)) counts[e] = (counts[e] || 0) + 1;
    const mostFrequent = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];

    const resolvedEmail =
      (mostFrequent && isValidEmail(mostFrequent) && mostFrequent) ||
      (isValidEmail(email) ? email.trim() : '');

    const resolvedName =
      (customerName || cart.find((i) => (i.customerName || '').trim())?.customerName || '').trim();

    const resolvedVehicle =
      (vehicleDetails || cart.find((i) => (i.vehicleDetails || '').trim())?.vehicleDetails || '').trim();

    return { resolvedEmail, resolvedName, resolvedVehicle };
  };

  // Ensure customer exists
  const ensureCustomerId = async (name: string, emailAddr: string, vehicle: string): Promise<string> => {
    if (!user?.token) throw new Error('You are logged out. Please sign in and try again.');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.token}`,
    };

    const body = {
      name: (name || 'Customer').trim(),
      email: (emailAddr || '').trim(),
      vehicleDetails: (vehicle || '').trim(),
    };

    const res = await fetch('https://jw-auto-clinic-246.onrender.com/api/customers/ensure', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch {}

    if (!res.ok) {
      throw new Error(json?.error || json?.message || text || 'Could not ensure customer');
    }
    if (!json?._id) throw new Error('Customer ensure did not return an _id');

    setSelectedCustomerId(json._id);
    if (json.name && json.name !== customerName) setCustomerName(json.name);
    if (json.email && json.email !== email) setEmail(json.email);
    if (json.vehicleDetails && json.vehicleDetails !== vehicleDetails) setVehicleDetails(json.vehicleDetails);
    return json._id;
  };

  // Cart types + state
  type CartItem = {
    id: string;

    // Legacy single-service id
    serviceTypeId: string | null;

    // NEW: full multi-select ids so we can restore combined selections
    serviceTypeIds?: string[];

    serviceType?: string | null;

    // For combined items this will be a comma-separated list of service names
    serviceName: string;

    // NEW: how many services are combined into this line (1 = single)
    serviceCount?: number;

    specialsId?: string | null;
    specialsName?: string | null;
    originalPrice: number;
    discountPercent: number;
    discountAmount: number;
    finalPrice: number;
    paymentMethod: string;
    customerId?: string | null;
    customerName?: string | null;
    email?: string | null;
    vehicleDetails?: string | null;

    notes?: string | null;
  };

  const [cart, setCart] = useState<CartItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCombinedList, setShowCombinedList] = useState(false);

  const CartRow: React.FC<{
    item: CartItem;
    onEdit: (id: string) => void;
    onRemove: (id: string) => void;
  }> = ({ item, onEdit, onRemove }) => {
    const [showDetails, setShowDetails] = useState(false);

    const rawNames = (item.serviceName || item.serviceType || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);

    const count =
      item.serviceCount ||
      (rawNames.length > 0 ? rawNames.length : 1);

    const isCombined = count > 1;

    // Build a short preview: "Oil Change, Alignment +2 more"
    let preview = "";
    if (rawNames.length === 1) preview = rawNames[0];
    else if (rawNames.length === 2) preview = `${rawNames[0]} • ${rawNames[1]}`;
    else if (rawNames.length > 2)
      preview = `${rawNames[0]}, ${rawNames[1]} + ${rawNames.length - 2} more`;

    return (
      <View style={styles.cartRow}>
        <View style={{ flex: 1 }}>
          {/* Title */}
          <Text style={styles.cartRowTitle}>
            {isCombined
              ? `Multiple services (${count})`
              : item.serviceName || item.serviceType || "Service"}
            {!isCombined && item.specialsName ? ` • ${item.specialsName}` : ""}
          </Text>

          {/* Compact preview for combined rows */}
          {isCombined && !!preview && (
            <Text style={[styles.cartRowSub, { marginTop: 2 }]} numberOfLines={2}>
              {preview}
            </Text>
          )}

          {/* Price line */}
          <Text style={[styles.cartRowSub, { marginTop: 4 }]}>
            ${item.originalPrice.toFixed(2)} → ${item.finalPrice.toFixed(2)}
            {item.discountPercent ? ` (${item.discountPercent}% off)` : ""}
          </Text>

          {/* Customer info */}
          {!!item.customerName && (
            <Text style={[styles.cartRowSub, { marginTop: 2 }]}>
              {item.customerName}
              {item.email ? ` • ${item.email}` : ""}
              {item.vehicleDetails ? ` • ${item.vehicleDetails}` : ""}
            </Text>
          )}

          {/* View details toggle for combined rows */}
          {isCombined && rawNames.length > 0 && (
            <>
              <TouchableOpacity
                onPress={() => setShowDetails(v => !v)}
                style={styles.cartDetailsToggle}
              >
                <Text style={styles.cartDetailsToggleText}>
                  {showDetails ? "Hide details" : "View details"}
                </Text>
              </TouchableOpacity>

              {showDetails && (
                <View style={{ marginTop: 4 }}>
                  {rawNames.map(name => (
                    <Text key={name} style={styles.cartRowSub}>
                      • {name}
                    </Text>
                  ))}
                </View>
              )}
            </>
          )}
        </View>

        {/* Actions */}
        <View style={styles.cartRowActions}>
          <TouchableOpacity
            onPress={() => onEdit(item.id)}
            style={styles.iconBtn}
            accessibilityLabel="Edit item"
          >
            <Ionicons name="create-outline" size={20} color="#6a0dad" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onRemove(item.id)}
            style={styles.iconBtn}
            accessibilityLabel="Remove item"
          >
            <Ionicons name="trash-outline" size={20} color="#d11a2a" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };


  // Price math
  useEffect(() => {
    const op = parseFloat(originalPrice || "0") || 0;
    const dp = parseFloat(discountPercent || "0") || 0;
    const dAmt = +(op * (dp / 100)).toFixed(2);
    const fAmt = +(op - dAmt).toFixed(2);
    setDiscountAmount(dAmt.toFixed(2));
    setFinalPrice(fAmt.toFixed(2));
  }, [originalPrice, discountPercent]);

  const clearForm = (keepCustomer = true) => {
    setServiceTypeIds([]);
    setOriginalPrice("");
    setDiscountPercent("");
    setPaymentMethod("");
    if (!keepCustomer) {
      setCustomerName("");
      setCustomerSuggestions([]);
      setSelectedCustomerId(null);
      setEmail("");
    }
    setDiscountAmount("0.00");
    setFinalPrice("0.00");
    setSpecialsId(null);
    setCustomerName("");
    setEmail("");
    setVehicleDetails("");
    setNotes("");
    setEditingId(null);
    setShowCombinedList(false);   // add this
  };  

  const addOrUpdateCartItem = () => {
    if (!serviceTypeIds.length || selectedServiceObjs.length === 0) {
      Alert.alert("Missing service", "Please select at least one Service Type.");
      return;
    }

    if (!paymentMethod) {
      Alert.alert("Payment method", "Please choose a payment method.");
      return;
    }

    const dpNum = parseFloat(discountPercent || "0") || 0;

    const subtotal = selectedServiceObjs.reduce((sum, s) => {
      const price = typeof s.price === "number" ? s.price : 0;
      return sum + price;
    }, 0);

    const discountAmt = +(subtotal * (dpNum / 100)).toFixed(2);
    const finalAmt = +(subtotal - discountAmt).toFixed(2);

    const combinedNames = selectedServiceObjs.map(s => s.name).join(", ");
    const count = selectedServiceObjs.length;

    const first = selectedServiceObjs[0];

    const baseItem: CartItem = {
      id: editingId ?? Math.random().toString(36).slice(2),
      serviceTypeId: count === 1 && first?._id ? first._id : null,
      serviceTypeIds: [...serviceTypeIds],
      serviceType: count === 1 ? (first?.name ?? "Service") : "Multiple Services",
      serviceName: combinedNames,
      serviceCount: count,
      specialsId: specialsId ?? null,
      specialsName: selectedSpecialObj?.name ?? null,
      originalPrice: subtotal,
      discountPercent: dpNum,
      discountAmount: discountAmt,
      finalPrice: finalAmt,
      paymentMethod,
      customerId: selectedCustomerId ?? null,
      customerName: (customerName ?? "").trim(),
      email: (email ?? "").trim(),
      vehicleDetails: (vehicleDetails ?? "").trim(),
      notes: notes ?? "",
    };

    if (editingId) {
      setCart(prev => prev.map(ci => (ci.id === editingId ? baseItem : ci)));
    } else {
      setCart(prev => [baseItem, ...prev]);
    }

    clearForm(true);
  };
  

  const editCartItem = (id: string) => {
    const ci = cart.find(x => x.id === id);
    if (!ci) return;

    setEditingId(ci.id);

    // Restore all previously selected services if available, otherwise fall back to single id
    if (ci.serviceTypeIds && ci.serviceTypeIds.length) {
      setServiceTypeIds(ci.serviceTypeIds);
    } else if (ci.serviceTypeId) {
      setServiceTypeIds([ci.serviceTypeId]);
    } else {
      setServiceTypeIds([]);
    }

    setSpecialsId(ci.specialsId ?? null);
    setOriginalPrice(ci.originalPrice.toString());
    setDiscountPercent(ci.discountPercent.toString());
    setPaymentMethod(ci.paymentMethod);
    setCustomerName(ci.customerName ?? "");
    setEmail(ci.email ?? "");
    setVehicleDetails(ci.vehicleDetails ?? "");
    setNotes(ci.notes ?? "");
    setDiscountAmount(ci.discountAmount.toFixed(2));
    setFinalPrice(ci.finalPrice.toFixed(2));
    setFormOpen(true);
    setShowCombinedList(false);
  };
  

  const removeCartItem = (id: string) => {
    setCart(prev => prev.filter(ci => ci.id !== id));
    if (editingId === id) clearForm(true);
  };

  const totals = useMemo(() => {
    const subtotal = cart.reduce((s, i) => s + i.originalPrice, 0);
    const totalDiscount = cart.reduce((s, i) => s + i.discountAmount, 0);
    const grandTotal = cart.reduce((s, i) => s + i.finalPrice, 0);
    return {
      subtotal: subtotal.toFixed(2),
      totalDiscount: totalDiscount.toFixed(2),
      grandTotal: grandTotal.toFixed(2),
    };
  }, [cart]);


  // Build a short "Oil Change, Alignment +2 more" style preview from cart items
  function buildCartCombinedPreview(items: typeof cart) {
    const names: string[] = [];
    items.forEach(it => {
      if (it.serviceName) {
        it.serviceName.split(",").forEach(raw => {
          const n = raw.trim();
          if (n) names.push(n);
        });
      }
    });
    const unique = Array.from(new Set(names));
    if (unique.length === 0) return "";
    if (unique.length === 1) return unique[0];
    if (unique.length === 2) return `${unique[0]} • ${unique[1]}`;
    return `${unique[0]}, ${unique[1]} + ${unique.length - 2} more`;
  }

  // For the live summary card (using selected services)
  const buildSelectedServicesPreview = (services: ServiceItem["raw"][]) => {
    const names = services.map(s => s.name).filter(Boolean);
    if (names.length === 0) return "";
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} • ${names[1]}`;
    return `${names[0]}, ${names[1]} + ${names.length - 2} more`;
  };


  const buildDetailCombinedPreview = (items: TransactionItem[] = []) => {
    const names: string[] = [];
    items.forEach(it => {
      const src = it.serviceName || it.serviceType || "";
      if (!src) return;
      src.split(",").forEach(raw => {
        const n = raw.trim();
        if (n) names.push(n);
      });
    });
    const unique = Array.from(new Set(names));
    if (unique.length === 0) return "";
    if (unique.length === 1) return unique[0];
    if (unique.length === 2) return `${unique[0]} • ${unique[1]}`;
    return `${unique[0]}, ${unique[1]} + ${unique.length - 2} more`;
  };
  

  // Helpers for receipt notes formatting
  function money(n: number | string) {
    const v = Number(n || 0);
    return isFinite(v) ? v.toFixed(2) : '0.00';
  }

  function buildCartNotesHTML(items: typeof cart, fallbackPM?: string) {
    const lis = items.map((it, idx) => {
      const pm = it.paymentMethod || fallbackPM || "Cash";
      const pct = Number(it.discountPercent || 0) / 100;
      const fromPct = (Number(it.originalPrice || 0) * pct) || 0;
      const discAmt = Number(it.discountAmount || 0) || fromPct || 0;
      const final = Math.max(0, Number(it.originalPrice || 0) - discAmt);

      const name = it.serviceName || it.serviceType || "Service";
      const special = it.specialsName ? ` <em>(${it.specialsName})</em>` : "";

      const discountLabel =
        discAmt > 0
          ? ` <span style="color:#999">(-$${money(discAmt)}${pct ? `, ${Math.round(pct * 100)}%` : ""})</span>`
          : "";

      return `<li style="margin-bottom:6px">
        <div><strong>${idx + 1}.</strong> ${name}${special}</div>
        <div>$${money(it.originalPrice)} → <strong>$${money(final)}</strong>${discountLabel}
          <span style="color:#666"> [${pm}]</span>
        </div>
        ${it.notes ? `<div style="color:#666;margin-top:2px">Note: ${it.notes}</div>` : ""}
      </li>`;
    }).join("");

    return `<ul style="margin:8px 0 0;padding-left:18px">${lis}</ul>`;
  }

  function buildCartNotesText(items: typeof cart, fallbackPM?: string) {
    return items
      .map((it, idx) => {
        const pm = it.paymentMethod || fallbackPM || "Cash";
        const pct = Number(it.discountPercent || 0) / 100;
        const fromPct = (Number(it.originalPrice || 0) * pct) || 0;
        const discAmt = Number(it.discountAmount || 0) || fromPct || 0;
        const final = Math.max(0, Number(it.originalPrice || 0) - discAmt);

        const discountLabel =
          discAmt > 0
            ? ` (-$${money(discAmt)}${pct ? `, ${Math.round(pct * 100)}%` : ""})`
            : "";

        return `${idx + 1}. ${it.serviceName || it.serviceType || "Service"}${
          it.specialsName ? ` (${it.specialsName})` : ""
        } — $${money(it.originalPrice)} -> $${money(final)}${discountLabel} [${pm}]${
          it.notes ? ` | Note: ${it.notes}` : ""
        }`;
      })
      .join("\n");
  }

  async function buildReceiptPdfBase64(html: string): Promise<string | undefined> {
    if (Platform.OS === 'web') return undefined;
    try {
      const r: any = await Print.printToFileAsync({ html, base64: true } as any);
      if (r?.base64) return `data:application/pdf;base64,${r.base64}`;
    } catch {}
    try {
      const { uri } = await Print.printToFileAsync({ html } as any);
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
      return `data:application/pdf;base64,${base64}`;
    } catch {
      return undefined;
    }
  }

  const submitAll = async () => {
    if (cart.length === 0) {
      Alert.alert("Cart is empty", "Add at least one item to submit.");
      return;
    }
  
    // Per-line validation
    const invalid = cart.find((i) =>
      !i.paymentMethod ||
      !i.customerName?.trim() ||
      !i.vehicleDetails?.trim() ||
      !isValidEmail(i.email)
    );
    if (invalid) {
      Alert.alert(
        "Missing info",
        "Each cart line must have a customer (name & valid email), a vehicle, and a payment method."
      );
      return;
    }
  
    if (!user?.token) {
      Alert.alert("Login required", "Please sign in and try again.");
      return;
    }
  
    // 1) Ensure customers once per unique (name+email)
    const ensuredMap = new Map<string, string>(); // key = name|email  -> customerId
    const nameEmailKey = (n: string, e: string) => `${n.trim().toLowerCase()}|${e.trim().toLowerCase()}`;
  
    for (const line of cart) {
      const k = nameEmailKey(line.customerName!, line.email!);
      if (!ensuredMap.has(k)) {
        try {
          const id = await ensureCustomerId(line.customerName!, line.email!, line.vehicleDetails!);
          ensuredMap.set(k, id);
        } catch (e: any) {
          Alert.alert("Customer error", e?.message || "Could not ensure customer.");
          return;
        }
      }
    }
  
    // 2) Group by (customerId × vehicle)
    type Group = {
      customerId: string;
      customerName: string;
      email: string;
      vehicle: string;
      items: CartItem[];
    };
    const groups = new Map<string, Group>(); // key = customerId|vehicle
  
    for (const line of cart) {
      const k = nameEmailKey(line.customerName!, line.email!);
      const customerId = ensuredMap.get(k)!;
  
      const vKey = `${customerId}|${line.vehicleDetails!.trim()}`;
      if (!groups.has(vKey)) {
        groups.set(vKey, {
          customerId,
          customerName: line.customerName!,
          email: line.email!,
          vehicle: line.vehicleDetails!,
          items: [],
        });
      }
      groups.get(vKey)!.items.push(line);
    }
  
    // 3) Submit each group to /batch (one email/receipt per group)
    let totalSaved = 0;
    const groupSummaries: string[] = [];
  
    for (const g of groups.values()) {
      // helper for consistent per-line discount
      const lineDiscount = (i: CartItem) => {
        const op = Number(i.originalPrice || 0);
        const dp = Number(i.discountPercent || 0);
        const amt = Number(i.discountAmount || 0);
        const fromPct = +(op * (dp / 100)).toFixed(2);
        return +( (amt > 0 ? amt : fromPct) ).toFixed(2);
      };

      const subtotal = g.items.reduce((s, i) => s + Number(i.originalPrice || 0), 0);
      const totalDiscount = g.items.reduce((s, i) => s + lineDiscount(i), 0);
      const total = g.items.reduce((s, i) => s + Number(i.finalPrice || (Number(i.originalPrice||0) - lineDiscount(i))), 0);
  
      const notesHTML = buildCartNotesHTML(g.items);
      const notesTEXT = buildCartNotesText(g.items);

      const combinedPreview = buildCartCombinedPreview(g.items);
      const serviceLabel =
        g.items.length === 1
          ? g.items[0].serviceName
          : `Multiple services (${g.items.length})${combinedPreview ? ` – ${combinedPreview}` : ""}`;
  
      const payload = {
        customerName: g.customerName,
        email: g.email,
        vehicleDetails: g.vehicle,
        customer: g.customerId,
        items: g.items.map(i => ({
          serviceTypeId: i.serviceTypeId,
          serviceType: i.serviceType,
          serviceName: i.serviceName,
          specialsId: i.specialsId,
          specialsName: i.specialsName,
          originalPrice: i.originalPrice,
          discountPercent: i.discountPercent,
          discountAmount: i.discountAmount,
          notes: (i.notes && i.notes.trim())
            ? `${i.notes.trim()}\n\n${notesTEXT}`
            : notesTEXT,
          paymentMethod: i.paymentMethod,
          customer: g.customerId,
        })),
      } as any;
  
      // Optional: attach a per-group PDF so the server can store/send it
      try {
        const html = await buildReceiptHTML({
          customerName: g.customerName,
          vehicleDetails: g.vehicle,
          email: g.email,
          employeeName: 'JW Auto Clinic 246',
          serviceType: serviceLabel,
          specials: g.items.length === 1 ? (g.items[0].specialsName || '') : '',
          paymentMethod: g.items.length > 1 ? 'Mixed' : (g.items[0].paymentMethod || 'Cash'),
          originalPrice: subtotal.toFixed(2),
          discountPercent: '',                         // keep label generic
          discountAmount: totalDiscount.toFixed(2),    // <-- now correct
          finalPrice: total.toFixed(2),
          notes: notesHTML,
        });
        const receiptPdfBase64 = await buildReceiptPdfBase64(html);
        if (receiptPdfBase64) {
          payload.receiptPdfBase64 = receiptPdfBase64;
          payload.receiptFileName = `Receipt-${new Date().toISOString().slice(0, 10)}.pdf`;
        }
      } catch (e) {
        // console.warn('Could not build group PDF:', e);
      }
  
      try {
        const res = await fetch("https://jw-auto-clinic-246.onrender.com/api/transactions/batch", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${user.token}`,
          },
          body: JSON.stringify(payload),
        });
  
        const text = await res.text();
        let data: any = null;
        try { data = text ? JSON.parse(text) : null; } catch {}
  
        if (!res.ok) throw new Error(data?.error || data?.message || text || "Batch save failed");
        const saved = Number(data?.savedCount) || 0;
        totalSaved += saved;
        groupSummaries.push(`${saved} item${saved !== 1 ? 's' : ''} → ${g.customerName} (${g.email}) • ${g.vehicle}`);
      } catch (e: any) {
        Alert.alert("Error", e?.message || "Could not submit a transaction group.");
        return;
      }
    }
  
    Alert.alert(
      "Success",
      `Submitted ${totalSaved} item${totalSaved !== 1 ? 's' : ''} in ${groups.size} receipt${groups.size !== 1 ? 's' : ''}:\n\n• ${groupSummaries.join('\n• ')}`
    );
  
    setCart([]);
    clearForm(false);
    fetchTransactions(true);
    setFormOpen(false);
  };
  

  const previewAndShareCartReceipt = async () => {
    if (cart.length === 0) {
      Alert.alert("Nothing to preview", "Add items to the cart first.");
      return;
    }
  
    // Group like submitAll: Customer × Vehicle
    const keyOf = (n: string, e: string, v: string) => `${n.trim().toLowerCase()}|${e.trim().toLowerCase()}|${v.trim().toLowerCase()}`;
    const groups = new Map<string, { name: string; email: string; vehicle: string; items: CartItem[] }>();
  
    for (const i of cart) {
      if (!i.customerName || !isValidEmail(i.email || '') || !i.vehicleDetails) {
        Alert.alert("Missing info", "Each line needs a customer, email, and vehicle to preview grouped receipts.");
        return;
      }
      const k = keyOf(i.customerName, i.email!, i.vehicleDetails);
      if (!groups.has(k)) groups.set(k, { name: i.customerName, email: i.email!, vehicle: i.vehicleDetails, items: [] });
      groups.get(k)!.items.push(i);
    }
  
    for (const g of groups.values()) {
      const totals = g.items.reduce(
        (acc, i) => {
          const op   = Number(i.originalPrice) || 0;
          const dp   = Number(i.discountPercent) || 0;
          const da   = Number(i.discountAmount) || 0;
          const dAmt = da > 0 ? da : +(op * (dp / 100)).toFixed(2); // <-- derive if amount is 0
          const fp   = Number.isFinite(Number(i.finalPrice))
          ? Number(i.finalPrice)
          : +(Math.max(0, op - dAmt)).toFixed(2);
          acc.subtotal += op;
          acc.discount += dAmt;
          acc.total    += fp;
          return acc;
        },
        { subtotal: 0, discount: 0, total: 0 }
      );

      const combinedPreview = buildCartCombinedPreview(g.items);
      const serviceLabel =
        g.items.length === 1
          ? g.items[0].serviceName
          : `Multiple services (${g.items.length})${combinedPreview ? ` – ${combinedPreview}` : ""}`;
  
      await generateAndShareReceipt({
        customerName: g.name,
        vehicleDetails: g.vehicle,
        email: g.email,
        employeeName: "JW Auto Clinic 246",
        serviceType: serviceLabel,
        specials: g.items.length === 1 ? (g.items[0].specialsName || "") : "",
        paymentMethod: g.items.length === 1 ? (g.items[0].paymentMethod || "Cash") : "Mixed",
        originalPrice: totals.subtotal.toFixed(2),
        discountPercent: "", // multiple lines → show amount only
        discountAmount: totals.discount.toFixed(2),
        finalPrice: totals.total.toFixed(2),
        notes: buildCartNotesHTML(g.items),
      });
    }
  };
  

  // Receipt building helpers
  type ReceiptData = {
    customerName: string;
    vehicleDetails: string;
    email: string;
    employeeName: string;
    serviceType: string;
    specials: string;
    paymentMethod: string;
    originalPrice: string;
    discountPercent: string;
    discountAmount: string;
    finalPrice: string;
    notes: string;
  };

  async function buildLogoBase64(): Promise<string> {
    try {
      const logoAsset = Asset.fromModule(require('@/assets/images/icon.png'));
      await logoAsset.downloadAsync();
      if (logoAsset.localUri) {
        return await FileSystem.readAsStringAsync(logoAsset.localUri, { encoding: 'base64' });
      }
    } catch {}
    return '';
  }

  async function buildReceiptHTML(data: ReceiptData): Promise<string> {
    const {
      customerName,
      vehicleDetails,
      email,
      employeeName,
      serviceType,
      specials,
      paymentMethod,
      originalPrice,
      discountPercent,
      discountAmount,
      finalPrice,
      notes,
    } = data;
  
    // --- numeric helpers ---
    const n = (v: any) => {
      const x = Number(v);
      return Number.isFinite(x) ? x : 0;
    };
  
    const op   = n(originalPrice);           // subtotal for grouped receipts or single price
    const dp   = n(discountPercent);         // percent (e.g. 10)
    const da   = n(discountAmount);          // explicit amount (e.g. 12.50)
    const dAmt = da > 0 ? da : +(op * (dp / 100)).toFixed(2);
    const total = n(finalPrice) || +(Math.max(0, op - dAmt)).toFixed(2);

    const hasList = !!notes && notes.includes("<ul");
    const notesHeading = hasList ? "Services Included" : "Notes";
  
    const date = new Date().toLocaleString();
    const logoBase64 = await buildLogoBase64();
  
    return `
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; background: #f9f9f9; color: #333; } 
            .header { display: flex; align-items: center; margin-bottom: 40px; } 
            .logo { width: 80px; height: auto; margin-right: 20px; } 
            .company-info h1 { font-size: 24px; color: #6a0dad; margin: 0; } 
            .company-info p { margin: 4px 0; font-size: 14px; color: #666; }
            .card { background: #fff; border-radius: 8px; padding: 24px; box-shadow: 0 4px 8px rgba(0,0,0,0.05); }
            .section-title { font-size: 18px; margin-bottom: 10px; color: #6a0dad; border-bottom: 1px solid #eee; padding-bottom: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { padding: 10px 12px; border: 1px solid #e0e0e0; text-align: left; }
            th { background-color: #f5f5f5; }
            .total-row th { text-align: right; font-size: 16px; }
            .total-row td { font-size: 16px; font-weight: bold; }
            .notes { margin-top: 30px; font-size: 14px; }
            .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #eee; color: #555; }
            .banking-table { width: auto; border-collapse: collapse; font-size: 12px; }
            .banking-table th, .banking-table td { padding: 4px 8px; border: none; }
            .banking-table th { background: transparent; color: #666; width: 1%; white-space: nowrap; font-weight: 600; text-align: left; }
            .banking-table tr + tr th, .banking-table tr + tr td { border-top: 1px solid #f0f0f0; }
          </style>
        </head>
        <body>
          <div class="header">
            ${logoBase64 ? `<img src="data:image/png;base64,${logoBase64}" class="logo" />` : ''}
            <div class="company-info">
              <h1>JW Auto Clinic 246</h1>
              <p>Automotive Service</p>
            </div>
          </div>
  
          <div class="card">
            <div class="section-title">Receipt</div>
            <p><strong>Date:</strong> ${date}</p>
            <p><strong>Customer:</strong> ${customerName}</p>
            <p><strong>Vehicle:</strong> ${vehicleDetails}</p>
            <p><strong>Email:</strong> ${email}</p>
  
            <table>
              <tr><th>Service</th><td>${serviceType}</td></tr>
              <tr><th>Employee</th><td>${employeeName}</td></tr>
              <tr><th>Payment Method</th><td>${paymentMethod}</td></tr>
              <tr><th>Special</th><td>${specials || 'None'}</td></tr>
              <tr><th>Original Price</th><td>$${op.toFixed(2)}</td></tr>
              <tr>
                <th>${dp ? `Discount (${dp}%)` : 'Discounts'}</th>
                <td>-$${dAmt.toFixed(2)}</td>
              </tr>
              <tr class="total-row"><th>Total</th><td>$${total.toFixed(2)}</td></tr>
            </table>
  
            <div class="notes">
              <strong>${notesHeading}:</strong><br/>
              ${notes || '—'}
            </div>
  
            <div class="footer print-footer">
              <div class="section-title" style="font-size:14px;margin-bottom:6px;">Banking Details</div>
              <table class="banking-table">
                <tr><th>Bank:</th><td>CIBC FirstCaribbean Int'l Bank</td></tr>
                <tr><th>Branch:</th><td>Wildey</td></tr>
                <tr><th>Transit:</th><td>09127</td></tr>
                <tr><th>Account #:</th><td>1001221485</td></tr>
                <tr><th>Swift Code/Routing #:</th><td>FCIBBBBB</td></tr>
              </table>
              <p><strong>Payments for cheques to: jwautoclinic</strong></p>
            </div>
          </div>
        </body>
      </html>
    `;
  }
  
  

  async function generateAndShareReceipt(data: ReceiptData) {
    const {
      customerName,
      vehicleDetails,
      email,
      employeeName,
      serviceType,
      specials,
      paymentMethod,
      originalPrice,
      discountPercent,
      discountAmount,
      finalPrice,
      notes,
    } = data;

    const hasList = !!notes && notes.includes("<ul");
    const notesHeading = hasList ? "Services Included" : "Notes";

    const now = new Date();
    const date = now.toLocaleString();

    let logoBase64 = "";
    try {
      const logoAsset = Asset.fromModule(require('@/assets/images/icon.png'));
      await logoAsset.downloadAsync();
      if (logoAsset.localUri) {
        logoBase64 = await FileSystem.readAsStringAsync(logoAsset.localUri, {
          encoding: 'base64',
        });
      }
    } catch (e) {
      // console.warn('⚠️ Failed to load or encode logo:', e);
    }

    const html = `
      <html>
        <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; background: #f9f9f9; color: #333; } 
          .header { display: flex; align-items: center; margin-bottom: 40px; } 
          .logo { width: 80px; height: auto; margin-right: 20px; } 
          .company-info h1 { font-size: 24px; color: #6a0dad; margin: 0; } 
          .company-info p { margin: 4px 0; font-size: 14px; color: #666; }

          .card { background: #fff; border-radius: 8px; padding: 24px; box-shadow: 0 4px 8px rgba(0,0,0,0.05); }
          .section-title { font-size: 18px; margin-bottom: 10px; color: #6a0dad; border-bottom: 1px solid #eee; padding-bottom: 4px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { padding: 10px 12px; border: 1px solid #e0e0e0; text-align: left; }
          th { background-color: #f5f5f5; }
          .total-row th { text-align: right; font-size: 16px; }
          .total-row td { font-size: 16px; font-weight: bold; }
          .notes { margin-top: 30px; font-size: 14px; }

          .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #eee; color: #555; }
          .banking-table { width: auto; border-collapse: collapse; font-size: 12px; }
          .banking-table th, .banking-table td { padding: 4px 8px; border: none; }
          .banking-table th { background: transparent; color: #666; width: 1%; white-space: nowrap; font-weight: 600; text-align: left; }
          .banking-table tr + tr th, .banking-table tr + tr td { border-top: 1px solid #f0f0f0; }

          @media print {
            body { background: #fff; }
            .card { box-shadow: none; }
            .print-footer { position: fixed; left: 40px; right: 40px; bottom: 24px; }
            .chip { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          ${logoBase64 ? `<img src="data:image/png;base64,${logoBase64}" class="logo" />` : ''}
          <div class="company-info">
            <h1>JW Auto Clinic 246</h1>
            <p>Automotive Service</p>
          </div>
        </div>

        <div class="card">
          <div class="section-title">Receipt</div>
          <p><strong>Date:</strong> ${date}</p>
          <p><strong>Customer:</strong> ${customerName}</p>
          <p><strong>Vehicle:</strong> ${vehicleDetails}</p>
          <p><strong>Email:</strong> ${email}</p>

          <table>
            <tr><th>Service</th><td>${serviceType}</td></tr>
            <tr><th>Employee</th><td>${employeeName}</td></tr>
            <tr><th>Payment Method</th><td>${paymentMethod}</td></tr>
            <tr><th>Special</th><td>${specials || 'None'}</td></tr>
            <tr><th>Original Price</th><td>$${parseFloat(originalPrice).toFixed(2)}</td></tr>
            <tr>
              <th>${discountPercent ? `Discount (${discountPercent}%)` : 'Discounts'}</th>
              <td>-$${parseFloat(discountAmount || '0').toFixed(2)}</td>
            </tr>
            <tr class="total-row"><th>Total</th><td>$${parseFloat(finalPrice).toFixed(2)}</td></tr>
          </table>

          <div class="notes">
            <strong>${notesHeading}:</strong><br/>
            ${notes || '—'}
          </div>

          <div class="footer print-footer">
            <div class="section-title" style="font-size:14px;margin-bottom:6px;">Banking Details</div>
            <table class="banking-table">
              <tr><th>Bank:</th><td>CIBC FirstCaribbean Int'l Bank</td></tr>
              <tr><th>Branch:</th><td>Wildey</td></tr>
              <tr><th>Transit:</th><td>09127</td></tr>
              <tr><th>Account #:</th><td>1001221485</td></tr>
              <tr><th>Swift Code/Routing #:</th><td>FCIBBBBB</td></tr>
            </table>
            <p><strong>Payments for cheques to: jwautoclinic</strong></p>
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          UTI: 'com.adobe.pdf',
          mimeType: 'application/pdf',
        });
      } else {
        Alert.alert('Receipt ready', `PDF generated at:\n${uri}`);
      }
    } catch (err: any) {
      // console.error('❌ PDF generation error:', err);
      alert(`Failed to generate or share receipt: ${err.message}`);
    }
  }

  // Refs
  const priceRef = useRef<TextInput>(null);
  const discountRef = useRef<TextInput>(null);
  const vehicleRef = useRef<TextInput>(null);
  const nameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const notesRef = useRef<TextInput>(null);

  // Quick display calcs
  const op = parseFloat(originalPrice || '0') || 0;
  const dp = parseFloat(discountPercent || '0') || 0;
  const dAmt = (Number(discountAmount) || (op * dp) / 100);
  const final = Math.max(0, op - dAmt);

  // Dropdown data + selections
  interface ServiceItem {
    label: string;
    value: string; // _id
    raw: {
      _id: string;
      name: string;
      price: number | { min: number; max: number } | null;
    };
  }

  interface SpecialItem {
    label: string;
    value: string; // _id
    raw: {
      _id: string;
      name: string;
      discountPercent?: number;
    };
  }

  const [serviceItems, setServiceItems] = useState<ServiceItem[]>([]);
  const [specialItems, setSpecialItems] = useState<SpecialItem[]>([]);

  // MULTI SELECT: store an array of service IDs
  const [serviceTypeIds, setServiceTypeIds] = useState<string[]>([]);
  const [specialsId, setSpecialsId] = useState<string | null>(null);

  // All selected services (raw)
  const selectedServiceObjs = useMemo(
    () => serviceItems
      .filter(item => serviceTypeIds.includes(item.value))
      .map(item => item.raw),
    [serviceItems, serviceTypeIds]
  );

  // “Primary” one (used to auto-fill price / summary)
  const primaryServiceObj = selectedServiceObjs[0];
  const selectedSpecialObj = specialItems.find(item => item.value === specialsId)?.raw as SpecialItem['raw'] | undefined;

  useEffect(() => {
    const fetchDropdownData = async () => {
      try {
        const [servicesRes, specialsRes] = await Promise.all([
          fetch('https://jw-auto-clinic-246.onrender.com/api/services'),
          fetch('https://jw-auto-clinic-246.onrender.com/api/specials')
        ]);

        const servicesData = await servicesRes.json();
        const specialsData = await specialsRes.json();

        const serviceOptions: ServiceItem[] = servicesData.map((s: { _id: string; name: string; price: number | { min: number; max: number } | null }) => {
          let displayPrice = 'N/A';
          if (typeof s.price === 'number') {
            displayPrice = `$${s.price.toFixed(2)}`;
          } else if (s.price && typeof s.price === 'object' && 'min' in s.price && 'max' in s.price) {
            displayPrice = `$${s.price.min} - $${s.price.max}`;
          }
          return {
            label: `${s.name} - ${displayPrice}`,
            value: s._id,
            raw: s,
          };
        });

        const specialOptions: SpecialItem[] = specialsData.map((s: { _id: string; name: string; discountPercent?: number }) => ({
          label: s.discountPercent != null ? `${s.name} - ${s.discountPercent}%` : `${s.name}`,
          value: s._id,
          raw: s,
        }));

        setServiceItems(serviceOptions);
        setSpecialItems(specialOptions);
      } catch (err) {
        // console.error('Error fetching services or specials:', err);
      }
    };

    fetchDropdownData();
  }, []);

  useEffect(() => {
    if (primaryServiceObj && typeof primaryServiceObj.price === 'number') {
      setOriginalPrice(primaryServiceObj.price?.toString() ?? '');
    } else if (!serviceTypeIds.length) {
      setOriginalPrice('');
    }
  }, [primaryServiceObj, serviceTypeIds.length]);  

  useEffect(() => {
    if (selectedSpecialObj && typeof selectedSpecialObj.discountPercent === 'number') {
      setDiscountPercent(String(selectedSpecialObj.discountPercent ?? 0));
    }
  }, [specialsId]);

  useEffect(() => {
    if (originalPrice && discountPercent) {
      const price = parseFloat(originalPrice);
      const disc = parseFloat(discountPercent);
      const amount = price * (disc / 100);
      setDiscountAmount(amount.toFixed(2));
      setFinalPrice((price - amount).toFixed(2));
    } else {
      setDiscountAmount('0.00');
      setFinalPrice(originalPrice || '0.00');
    }
  }, [originalPrice, discountPercent]);

  // Customer search
  const [customerSuggestions, setCustomerSuggestions] = useState<{ _id: string; name: string; email: string; customerCode: string }[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  useEffect(() => {
    setVehicleSuggestions([]);
    setShowVehicleList(false);
    setVehicleQuery('');
  }, [selectedCustomerId]);


  useEffect(() => {
    const cid = selectedCustomerId ?? '';
    const list = cid ? (vehicleCacheRef.current[cid] ?? []) : [];
    setVehicleSuggestions(list);
    setShowVehicleList(Boolean(cid && list.length));
  }, [selectedCustomerId]);
  
  

  useEffect(() => {
    const delayDebounce = setTimeout(async () => {
      if (customerName.trim().length < 2) {
        setCustomerSuggestions([]);
        return;
      }
      try {
        const res = await fetch(
          `https://jw-auto-clinic-246.onrender.com/api/customers/search?name=${encodeURIComponent(customerName)}`,
          {
            headers: { Authorization: `Bearer ${user!.token}` },
          }
        );
        const data = await res.json();
        setCustomerSuggestions(Array.isArray(data) ? data : []);
      } catch (err) {
        // console.error('Customer search failed:', err);
      }
    }, 300);
    return () => clearTimeout(delayDebounce);
  }, [customerName]);

  const [vehicleSuggestions, setVehicleSuggestions] = useState<string[]>([]);
  const [vehicleQuery, setVehicleQuery] = useState('');
  const [showVehicleList, setShowVehicleList] = useState(false); 
  const vehicleCacheRef = useRef<Record<string, string[]>>({});
  const vehicleCustomerRef = useRef<string | null>(null);        

  // Fetch distinct vehicle names used by this customer before
  const fetchVehicleHistory = async (customerId?: string | null) => {
    if (!user?.token || !customerId) return;
    vehicleCustomerRef.current = customerId;
  
    try {
      const res = await fetch(
        `https://jw-auto-clinic-246.onrender.com/api/transactions/vehicles?customer=${encodeURIComponent(customerId)}&limit=50`,
        { headers: { Authorization: `Bearer ${user.token}` } }
      );
      const uniq: string[] = await res.json();
  
      if (vehicleCustomerRef.current !== customerId) return; // stale response
      vehicleCacheRef.current[customerId] = uniq;
      setVehicleSuggestions(uniq);
      setShowVehicleList(uniq.length > 0);
    } catch {
      if (vehicleCustomerRef.current !== customerId) return;
      vehicleCacheRef.current[customerId] = [];
      setVehicleSuggestions([]);
      setShowVehicleList(false);
    }
  };
  
  



  // ===== Management (Services & Specials) =====
  const [services, setServices] = useState<{ _id: string; name: string; price: number }[]>([]);
  const [specialsList, setSpecialsList] = useState<{ _id: string; name: string; discountPercent: number }[]>([]);
  const [editItem, setEditItem] = useState<{ _id: string; name: string; price?: number; discountPercent?: number } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showServices, setShowServices] = useState(true);
  const [showSpecials, setShowSpecials] = useState(true);
  const [serviceSearch, setServiceSearch] = useState('');
  const [specialSearch, setSpecialSearch] = useState('');

  const fetchServices = async () => {
    if (!user?.token) return;
    try {
      const res = await fetch("https://jw-auto-clinic-246.onrender.com/api/services", {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      const data = await res.json();
      setServices(Array.isArray(data) ? data : []);
    } catch (e) {
      // console.warn("fetchServices error:", e);
    }
  };

  const fetchSpecials = async () => {
    if (!user?.token) return;
    try {
      const res = await fetch("https://jw-auto-clinic-246.onrender.com/api/specials", {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      const data = await res.json();
      setSpecialsList(Array.isArray(data) ? data : []);
    } catch (e) {
      // console.warn("fetchSpecials error:", e);
    }
  };

  // When Manage modal opens, load lists
  useEffect(() => {
    if (manageOpen) {
      fetchServices();
      fetchSpecials();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manageOpen]);

  const handleSaveService = async () => {
    if (!newService || !newServicePrice) {
      alert("Please enter both service name and price.");
      return;
    }
    try {
      const res = await fetch("https://jw-auto-clinic-246.onrender.com/api/services", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user!.token}`,
        },
        body: JSON.stringify({
          name: newService,
          price: parseFloat(newServicePrice),
        }),
      });
      if (!res.ok) throw new Error("Failed to save service");
      alert("Service saved!");
      setNewService('');
      setNewServicePrice('');
      fetchServices();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteService = async (id: string) => {
    if (!user?.token) {
      alert('You must be logged in to perform this action.');
      return;
    }
    const confirmDelete = async () => {
      try {
        const res = await fetch(`https://jw-auto-clinic-246.onrender.com/api/services/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${user.token}` },
        });
        if (!res.ok) throw new Error('Failed to delete service');
        alert('Service deleted!');
        fetchServices();
      } catch (err: any) {
        alert(err.message);
      }
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to delete this service?')) await confirmDelete();
    } else {
      Alert.alert('Confirm Deletion', 'Are you sure you want to delete this service?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: confirmDelete },
      ], { cancelable: true });
    }
  };

  const handleEditService = (item: { _id: string; name: string; price: number }) => {
    setEditItem(item);
    setEditValue(item.price.toString());
  };

  const handleSaveSpecial = async () => {
    if (!newSpecial || !newSpecialPrice) {
      alert("Please enter both special name and discount %.");
      return;
    }
    try {
      const res = await fetch("https://jw-auto-clinic-246.onrender.com/api/specials", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user!.token}`,
        },
        body: JSON.stringify({
          name: newSpecial,
          discountPercent: parseFloat(newSpecialPrice),
        }),
      });
      if (!res.ok) throw new Error("Failed to save special");
      alert("Special saved!");
      setNewSpecial('');
      setNewSpecialPrice('');
      fetchSpecials();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleEditSpecial = (item: { _id: string; name: string; discountPercent: number }) => {
    setEditItem(item);
    setEditValue(item.discountPercent.toString());
  };

  const handleDeleteSpecial = async (id: string) => {
    if (!user?.token) {
      alert('You must be logged in to perform this action.');
      return;
    }
    const confirmDelete = async () => {
      try {
        const res = await fetch(`https://jw-auto-clinic-246.onrender.com/api/specials/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${user.token}` },
        });
        if (!res.ok) throw new Error('Failed to delete special');
        alert('Special deleted!');
        fetchSpecials();
      } catch (err: any) {
        alert(err.message);
      }
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to delete this special?')) await confirmDelete();
    } else {
      Alert.alert('Confirm Deletion', 'Are you sure you want to delete this special?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: confirmDelete },
      ], { cancelable: true });
    }
  };


  const multiSelectedCount = selectedServiceObjs.length;

  const [checkoutBarH, setCheckoutBarH] = useState(0);
  const isCheckoutBarVisible = !isWide && cart.length > 0;


  const renderCartRowContent = (item: CartItem) => {
    const count =
      item.serviceCount ||
      (item.serviceName ? item.serviceName.split(",").filter(Boolean).length : 1);

    const isCombined = count > 1;

    let preview = "";
    if (item.serviceName) {
      const names = item.serviceName
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);
      if (names.length === 1) preview = names[0];
      else if (names.length === 2) preview = `${names[0]} • ${names[1]}`;
      else if (names.length > 2)
        preview = `${names[0]}, ${names[1]} + ${names.length - 2} more`;
    }

    return (
      <View style={{ flex: 1 }}>
        <Text style={styles.cartRowTitle}>
          {isCombined
            ? `Multiple services (${count})`
            : item.serviceName || item.serviceType || "Service"}
          {!isCombined && item.specialsName ? ` • ${item.specialsName}` : ""}
        </Text>

        {isCombined && !!preview && (
          <Text
            style={[styles.cartRowSub, { marginTop: 2 }]}
            numberOfLines={2}
          >
            {preview}
          </Text>
        )}

        <Text style={[styles.cartRowSub, { marginTop: 4 }]}>
          ${item.originalPrice.toFixed(2)} → ${item.finalPrice.toFixed(2)}
          {item.discountPercent ? ` (${item.discountPercent}% off)` : ""}
        </Text>

        {!!item.customerName && (
          <Text style={[styles.cartRowSub, { marginTop: 2 }]}>
            {item.customerName}
            {item.email ? ` • ${item.email}` : ""}
            {item.vehicleDetails ? ` • ${item.vehicleDetails}` : ""}
          </Text>
        )}
      </View>
    );
  };


  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#fff' }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <View style={[styles.container, isWide && styles.containerWide]}>

        {/* TRANSACTIONS CONTENT (always visible) */}
        <View style={[styles.posContainer, isWide && styles.posContainerWide]}>
          {/* LEFT: Transactions list */}
          <View style={[styles.posLeft, { paddingHorizontal: 0 }]}>
            <FlatList
              data={tx}
              keyExtractor={(item) => item._id}
              onEndReached={() => cursor && !loadingTx && fetchTransactions(false)}
              onEndReachedThreshold={0.4}
              refreshing={loadingTx}
              onRefresh={() => fetchTransactions(true)}
              stickyHeaderIndices={[0]}
              ListHeaderComponent={StickyTxHeader}
              ListEmptyComponent={
                !loadingTx ? (
                  <Text style={{ textAlign: "center", marginTop: 40, color: "#666" }}>
                    No transactions yet. Tap + to add your first.
                  </Text>
                ) : null
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => openTransactionDetails(item._id)}
                  style={{ paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderColor: "#eee", flexDirection: "row", justifyContent: "space-between" }}
                  accessibilityLabel="Open transaction details"
                >
                  <View style={{ flex: 1, paddingRight: 8, }}>
                    <Text style={{ fontWeight: "700" }}>{item.serviceType || item.serviceName || "Service"}</Text>
                    <Text style={{ color: "#555", marginTop: 2 }}>
                      ${Number(item.finalPrice ?? item.originalPrice ?? 0).toFixed(2)} • {item.paymentMethod || "Cash"}
                    </Text>
                    {!!item.customerName && <Text style={{ color: "#777", marginTop: 2 }}>{item.customerName}</Text>}
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#999" />
                </TouchableOpacity>
              )}
              contentContainerStyle={{ paddingBottom: 100, }}
              onScroll={(e) => setHeaderElevated(e.nativeEvent.contentOffset.y > 2)}  // ← add
              scrollEventThrottle={16}
            />

            {/* Speed-dial FAB (Add Transaction + Manage Services) */}
            <>
              {txFabOpen && (
                <TouchableOpacity
                  activeOpacity={1}
                  onPress={() => setTxFabOpen(false)}
                  style={styles.fabBackdrop}
                  accessibilityLabel="Close actions"
                />
              )}

              <View
                pointerEvents="box-none"
                style={[
                  styles.fabContainerTx, 
                  isCheckoutBarVisible && { bottom: (Platform.OS === "android" ? -80 : 20) + checkoutBarH + 8 }, // +8px gap
                ]}
              >
                {txFabOpen && (
                  <View style={{ marginBottom: 64 }}>
                    {/* Add Transaction */}
                    <View style={styles.fabOptionRow}>
                      <TouchableOpacity
                        style={[styles.smallFab, { backgroundColor: '#6a0dad' }]}
                        onPress={() => { setTxFabOpen(false); openForm(); }}
                        accessibilityLabel="Add Transaction"
                      >
                        <Ionicons name="document-text-outline" size={22} color="#fff" />
                      </TouchableOpacity>
                      <Text style={styles.fabOptionLabel}>Add Transaction</Text>
                    </View>

                    {/* Manage Services (admin only) */}
                    {canManage && (
                      <View style={styles.fabOptionRow}>
                        <TouchableOpacity
                          style={[styles.smallFab, { backgroundColor: '#4CAF50' }]}
                          onPress={() => {
                            setTxFabOpen(false);
                            setManageOpen(true);
                          }}
                          accessibilityLabel="Manage Services"
                        >
                          <Ionicons name="construct-outline" size={22} color="#fff" />
                        </TouchableOpacity>
                        <Text style={styles.fabOptionLabel}>Manage Services</Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Main toggle FAB */}
                <TouchableOpacity
                  onPress={() => setTxFabOpen(v => !v)}
                  style={styles.fabTx}
                  accessibilityLabel="Open actions"
                  accessibilityRole="button"
                >
                  <Ionicons name={txFabOpen ? 'close' : 'add'} size={28} color="#fff" />
                </TouchableOpacity>
              </View>
            </>
          </View>

          {/* RIGHT: Cart & Summary (only on wide screens) */}
          {isWide && (
            <View style={styles.posRight}>
              <View style={styles.cartCard}>
                <View style={styles.cartHeader}>
                  <Text style={styles.cartTitle}>Cart</Text>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{cart.length}</Text>
                  </View>
                </View>

                {cart.length === 0 ? (
                  <Text style={{ color: "#666", marginTop: 8 }}>
                    No items yet. Use the + button to add.
                  </Text>
                ) : (
                  <FlatList
                    data={cart}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => (
                      <CartRow
                        item={item}
                        onEdit={editCartItem}
                        onRemove={removeCartItem}
                      />
                    )}
                    ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                    style={{ marginTop: 12 }}
                  />
                )}


                <View style={styles.totalsBox}>
                  <View style={styles.totalsRow}>
                    <Text style={styles.totalsLabel}>Subtotal</Text>
                    <Text style={styles.totalsValue}>${totals.subtotal}</Text>
                  </View>
                  <View style={styles.totalsRow}>
                    <Text style={styles.totalsLabel}>Discounts</Text>
                    <Text style={styles.totalsValue}>− ${totals.totalDiscount}</Text>
                  </View>
                  <View style={[styles.totalsRow, { borderTopWidth: 1, borderColor: "#eee", paddingTop: 8, marginTop: 8 }]}>
                    <Text style={[styles.totalsLabel, { fontWeight: "800" }]}>Total</Text>
                    <Text style={[styles.totalsValue, { fontWeight: "800" }]}>${totals.grandTotal}</Text>
                  </View>
                </View>

                <TouchableOpacity style={[styles.checkoutBtn, { backgroundColor: "#6a0dad" }]} onPress={submitAll}>
                  <Ionicons name="cash-outline" size={20} color="#fff" />
                  <Text style={styles.checkoutBtnText}>Charge ${totals.grandTotal}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.checkoutBtn, { backgroundColor: "#4caf50" }]} onPress={previewAndShareCartReceipt}>
                  <Ionicons name="share-social-outline" size={20} color="#fff" />
                  <Text style={styles.checkoutBtnText}>Preview & Share Receipt</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.checkoutBtn, { backgroundColor: "#999" }]} onPress={() => setCart([])}>
                  <Ionicons name="close-circle-outline" size={20} color="#fff" />
                  <Text style={styles.checkoutBtnText}>Clear Cart</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Sticky bottom bar on small screens */}
          {!isWide && cart.length > 0 && (
            <View
              style={styles.checkoutBar}
              onLayout={e => setCheckoutBarH(e.nativeEvent.layout.height)}
            >
              <View>
                <Text style={{ fontWeight: "700" }}>Total</Text>
                <Text style={{ fontSize: 18 }}>${totals.grandTotal}</Text>
              </View>

              <TouchableOpacity
                style={[styles.checkoutBtnSmall, { backgroundColor: "#6a0dad", flexDirection: 'row', alignItems: 'center', gap: 8 }]}
                onPress={() => setCartModalVisible(true)}
                accessibilityLabel="Open cart"
              >
                <Ionicons name="cart-outline" size={18} color="#fff" />
                <Text style={styles.checkoutBtnSmallText}>Cart ({cart.length})</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* EDIT MODAL (now a real Modal so it sits above Manage modal) */}
      <Modal
        visible={!!editItem}
        transparent
        animationType="fade"
        onRequestClose={() => setEditItem(null)}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.5)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20,
        }}>
          <View style={{
            backgroundColor: 'white', padding: 20, borderRadius: 12, width: '100%',
          }}>
            <Text style={{ fontWeight: 'bold', marginBottom: 10 }}>
              Edit {editItem?.discountPercent !== undefined ? 'Special' : 'Service'}: {editItem?.name}
            </Text>
            <TextInput
              style={[styles.input, { minHeight: 48 }]}
              value={editValue}
              onChangeText={setEditValue}
              keyboardType={editItem?.discountPercent !== undefined ? 'number-pad' : (Platform.OS === 'ios' ? 'decimal-pad' : 'numeric')}
              inputMode={editItem?.discountPercent !== undefined ? 'numeric' : 'decimal'}
              placeholder={editItem?.discountPercent !== undefined ? 'Discount %' : 'Price $'}
              placeholderTextColor="#777"
            />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, gap: 8 }}>
              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: '#aaa', flex: 1 }]}
                onPress={() => setEditItem(null)}
              >
                <Text style={styles.submitText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitButton, { flex: 1 }]}
                onPress={async () => {
                  if (!editItem) return;
                  try {
                    const endpoint = editItem.discountPercent !== undefined
                      ? `https://jw-auto-clinic-246.onrender.com/api/specials/${editItem._id}`
                      : `https://jw-auto-clinic-246.onrender.com/api/services/${editItem._id}`;

                    const body = editItem.discountPercent !== undefined
                      ? { discountPercent: parseFloat(editValue) }
                      : { price: parseFloat(editValue) };

                    const optimisticUpdater = (list: any[], key: 'price' | 'discountPercent') =>
                      list.map(item => item._id === editItem._id ? { ...item, [key]: parseFloat(editValue) } : item);

                    if (editItem.discountPercent !== undefined) {
                      setSpecialsList(prev => optimisticUpdater(prev, 'discountPercent'));
                    } else {
                      setServices(prev => optimisticUpdater(prev, 'price'));
                    }

                    setEditItem(null);

                    const res = await fetch(endpoint, {
                      method: 'PUT',
                      headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${user!.token}`,
                      },
                      body: JSON.stringify(body),
                    });

                    if (!res.ok) throw new Error('Failed to update');
                    alert('Updated successfully!');
                  } catch (err: any) {
                    alert(err.message);
                  }
                }}
              >
                <Text style={styles.submitText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* CART MODAL (mobile) */}
      {!isWide && (
        <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, ...Platform.select({ android: { marginBottom: -40 } }) }}>
          <View
            style={{
              display: cartModalVisible ? 'flex' : 'none',
              position: 'absolute',
              top: 10, left: 0, right: 0, bottom: 0,
              backgroundColor: '#fff',
              height: "88%",
            }}
          >
            <View style={{ paddingTop: Platform.OS === 'ios' ? 44 : 24, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderColor: '#eee', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 18, fontWeight: '800' }}>Cart</Text>
              <TouchableOpacity onPress={() => setCartModalVisible(false)} accessibilityLabel="Close cart">
                <Ionicons name="close" size={26} color="#333" />
              </TouchableOpacity>
            </View>

            <View style={{ flex: 1, padding: 12 }}>
              {cart.length === 0 ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: "#666" }}>Your cart is empty.</Text>
                </View>
              ) : (
                <FlatList
                  data={cart}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <CartRow
                      item={item}
                      onEdit={(id) => {
                        setCartModalVisible(false);
                        editCartItem(id);
                      }}
                      onRemove={removeCartItem}
                    />
                  )}
                  ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                  contentContainerStyle={{ paddingBottom: 12 }}
                  showsVerticalScrollIndicator
                />
              )}
            </View>

            <View style={{ padding: 12, borderTopWidth: 1, borderColor: '#eee' }} onLayout={e => setCheckoutBarH(e.nativeEvent.layout.height)}>
              <View style={[styles.totalsRow, { marginBottom: 12 }]}>
                <Text style={[styles.totalsLabel, { fontSize: 16 }]}>Total</Text>
                <Text style={[styles.totalsValue, { fontSize: 18 }]}>${totals.grandTotal}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  style={[styles.checkoutBtn, { backgroundColor: "#999", flex: 1 }]}
                  onPress={() => setCart([])}
                  accessibilityLabel="Clear cart"
                >
                  <Ionicons name="close-circle-outline" size={20} color="#fff" />
                  <Text style={styles.checkoutBtnText}>Clear</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.checkoutBtn, { backgroundColor: "#4caf50", flex: 1 }]}
                  onPress={previewAndShareCartReceipt}
                >
                  <Ionicons name="share-social-outline" size={20} color="#fff" />
                  <Text style={styles.checkoutBtnText}>Share</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.checkoutBtn, { backgroundColor: "#6a0dad", flex: 1 }]}
                  onPress={() => { setCartModalVisible(false); submitAll(); }}
                  accessibilityLabel="Charge and submit transactions"
                >
                  <Ionicons name="cash-outline" size={20} color="#fff" />
                  <Text style={styles.checkoutBtnText}>Charge</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* ADD/EDIT FORM MODAL (Add Transaction) */}
      <Modal
        visible={formOpen}
        onRequestClose={closeForm}
        animationType="slide"
        presentationStyle={isWide ? "formSheet" as any : "fullScreen"}
      >
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: "#fff" }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
        >
          {/* Header */}
          <View style={{ paddingTop: Platform.OS === 'ios' ? 48 : 16, paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: 1, borderColor: "#eee", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontSize: 18, fontWeight: "800" }}>{editingId ? "Edit Item" : "Add New Transaction"}</Text>
            <TouchableOpacity onPress={closeForm}><Ionicons name="close" size={26} /></TouchableOpacity>
          </View>

          {/* Form */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Service */}
            <View style={{ zIndex: Platform.OS === "web" ? 3000 : undefined }}>
              <Text style={styles.label}>Service Type</Text>
              <DropDownPicker
                multiple
                mode="BADGE"
                open={openService}
                value={serviceTypeIds}
                items={serviceItems}
                setOpen={setOpenService}
                setValue={setServiceTypeIds}
                placeholder="Select service(s)"
                searchable
                searchPlaceholder="Search services..."
                searchTextInputStyle={{
                  borderColor: "#ccc",
                  borderWidth: 1,
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  marginBottom: 8,
                }}
                style={[
                  styles.dropdown,
                  Platform.select({ android: { elevation: 1 }, ios: { zIndex: 1000 }, default: {} }),
                ]}
                dropDownContainerStyle={[
                  styles.dropdownContainer,
                  Platform.select({ ios: { zIndex: 999 }, android: { elevation: 0 }, default: {} }),
                ]}
                listMode={Platform.OS === 'web' ? 'SCROLLVIEW' : 'MODAL'}
                scrollViewProps={{
                  nestedScrollEnabled: true,
                  keyboardShouldPersistTaps: "handled",
                  showsVerticalScrollIndicator: true,
                  persistentScrollbar: true,
                }}
              />
            </View>

            {/* Specials */}
            <View style={{ zIndex: 2500, marginTop: 8 }}>
              <Text style={styles.label}>Specials</Text>
              <DropDownPicker
                open={openSpecials}
                value={specialsId}
                items={specialItems}
                setOpen={setOpenSpecials}
                setValue={setSpecialsId}
                placeholder="Select special"
                style={[
                  styles.dropdown,
                  Platform.select({ android: { elevation: 1 }, ios: { zIndex: 1000 }, default: {} }),
                ]}
                dropDownContainerStyle={[
                  styles.dropdownContainer,
                  Platform.select({ ios: { zIndex: 999 }, android: { elevation: 0 }, default: {} }),
                ]}
                listMode={Platform.OS === 'web' ? 'SCROLLVIEW' : 'MODAL'}
                scrollViewProps={{
                  nestedScrollEnabled: true,
                  keyboardShouldPersistTaps: "handled",
                  showsVerticalScrollIndicator: true,
                  persistentScrollbar: true,
                }}
              />
            </View>

            {/* Price & Discount */}
            <Text style={[styles.label, { marginTop: 10, display: 'none' }]}>Original Price ($)</Text>
            <TextInput
              ref={priceRef}
              style={[styles.input, { minHeight: 48, display: 'none' }]}
              value={originalPrice}
              keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
              inputMode="decimal"
              returnKeyType="next"
              placeholder="e.g. 50.00"
              placeholderTextColor="#777"
              onSubmitEditing={() => discountRef.current?.focus()}
              blurOnSubmit={false}
              onChangeText={(text) => {
                const sanitized = text.replace(/[^0-9.]/g, "").replace(/(\..*?)\..*/g, "$1");
                setOriginalPrice(sanitized);
              }}
            />

            <Text style={styles.label}>Discount Percent (%)</Text>
            <TextInput
              ref={discountRef}
              style={[styles.input, { minHeight: 48 }]}
              value={discountPercent}
              keyboardType="number-pad"
              inputMode="numeric"
              returnKeyType="next"
              placeholder="e.g. 10"
              placeholderTextColor="#777"
              onSubmitEditing={() => vehicleRef.current?.focus()}
              blurOnSubmit={false}
              onChangeText={(text) => setDiscountPercent(text.replace(/[^0-9]/g, ""))}
            />

            {/* Summary */}
            {/* Unified price summary — treat all selected services as ONE */}
            <View
              style={{
                marginTop: 8,
                backgroundColor: "#faf5ff",
                borderColor: "#ead7ff",
                borderWidth: 1,
                borderRadius: 10,
                padding: 12,
              }}
            >
              {(() => {
                const subtotal = selectedServiceObjs.reduce((sum, s) => {
                  const price = typeof s.price === "number" ? s.price : 0;
                  return sum + price;
                }, 0);

                const pct = dp || 0;
                const discountAmount = +(subtotal * (pct / 100)).toFixed(2);
                const finalPrice = +(subtotal - discountAmount).toFixed(2);

                const hasSelection = multiSelectedCount > 0;
                const preview = hasSelection
                  ? buildSelectedServicesPreview(selectedServiceObjs)
                  : "";

                return (
                  <>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                      }}
                    >
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={{ color: "#555", fontWeight: "600" }}>
                          {multiSelectedCount > 1
                            ? `Combined Original (${multiSelectedCount} services)`
                            : "Original"}
                        </Text>
                        {!!preview && (
                          <Text
                            style={{
                              color: "#777",
                              fontSize: 11,
                              marginTop: 2,
                            }}
                            numberOfLines={2}
                          >
                            {preview}
                          </Text>
                        )}
                      </View>
                      <Text style={{ fontWeight: "700" }}>
                        ${subtotal.toFixed(2)}
                      </Text>
                    </View>

                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        marginTop: 4,
                      }}
                    >
                      <Text style={{ color: "#555" }}>Discount ({pct}%)</Text>
                      <Text style={{ fontWeight: "600" }}>
                        − ${discountAmount.toFixed(2)}
                      </Text>
                    </View>

                    <View
                      style={{
                        height: 1,
                        backgroundColor: "#ead7ff",
                        marginVertical: 8,
                      }}
                    />

                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                      }}
                    >
                      <Text style={{ fontWeight: "800" }}>Final</Text>
                      <Text
                        style={{ fontWeight: "800", fontSize: 16 }}
                      >{`$${finalPrice.toFixed(2)}`}</Text>
                    </View>

                    {multiSelectedCount > 1 && (
                      <>
                        <TouchableOpacity
                          onPress={() => setShowCombinedList(v => !v)}
                          style={{
                            marginTop: 8,
                            alignSelf: "flex-start",
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: "#d3c2ff",
                            backgroundColor: "#f5eeff",
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: "600",
                              color: "#6a0dad",
                            }}
                          >
                            {showCombinedList
                              ? "Hide Combined List"
                              : "View Combined List"}
                          </Text>
                        </TouchableOpacity>

                        {showCombinedList && (
                          <View style={{ marginTop: 6 }}>
                            {selectedServiceObjs.map(s => (
                              <Text
                                key={s._id}
                                style={{ fontSize: 12, color: "#555" }}
                              >
                                • {s.name}
                              </Text>
                            ))}
                          </View>
                        )}
                      </>
                    )}
                  </>
                );
              })()}
            </View>


            {/* Customer */}
            <Text style={styles.label}>Customer Name</Text>
            <TextInput
              ref={nameRef}
              style={[styles.input, { minHeight: 48 }]}
              value={customerName ?? ""}
              autoCapitalize="words"
              textContentType="name"
              returnKeyType="next"
              onSubmitEditing={() => emailRef.current?.focus()}
              onChangeText={async (text) => {
                setCustomerName(text);
                setSelectedCustomerId(null);
                setVehicleSuggestions([]);
                setShowVehicleList(false);
                setVehicleQuery('');

                // existing customer search logic
                if (text.trim().length > 1) {
                  try {
                    const res = await fetch(`https://jw-auto-clinic-246.onrender.com/api/customers`, {
                      headers: { Authorization: `Bearer ${user!.token}` },
                    });
                    const allCustomers = await res.json();
                    const filtered = allCustomers.filter((c: any) =>
                      c.name.toLowerCase().includes(text.toLowerCase())
                    );
                    setCustomerSuggestions(filtered);
                  } catch (err) {
                    // console.error("Error fetching suggestions:", err);
                  }
                } else {
                  setCustomerSuggestions([]);
                }
              }}
              placeholder="e.g. Jane Smith"
              placeholderTextColor="#777"
            />
            {customerSuggestions.length > 0 && (
              <View style={styles.suggestionBox}>
                {customerSuggestions.map((customer) => (
                  <TouchableOpacity
                    key={customer._id}
                    onPress={() => {
                      setCustomerName(customer.name);
                      setEmail(customer.email);
                      setSelectedCustomerId(customer._id);
                      setCustomerSuggestions([]);

                      const cached = vehicleCacheRef.current[customer._id];
                      if (cached) {
                        setVehicleSuggestions(cached);
                        setShowVehicleList(cached.length > 0);
                      } else {
                        fetchVehicleHistory(customer._id);
                      }
                    }}
                    style={styles.suggestionItem}
                  >
                    <Text>{customer.name} • {customer.customerCode}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={styles.label}>Customer Email</Text>
            <TextInput
              ref={emailRef}
              style={[styles.input, { minHeight: 48 }]}
              value={email ?? ""}
              onChangeText={setEmail}
              keyboardType="email-address"
              inputMode="email"
              textContentType="emailAddress"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => notesRef.current?.focus()}
              placeholder="e.g. jane@example.com"
              placeholderTextColor="#777"
            />

            <Text style={[styles.label, { marginTop: 10 }]}>Vehicle Details</Text>
            <TextInput
              ref={vehicleRef}
              style={[styles.input, { minHeight: 48 }]}
              value={vehicleDetails}
              onFocus={() => setShowVehicleList(!!selectedCustomerId && vehicleSuggestions.length > 0)}
              onChangeText={(t) => { setVehicleDetails(t); setVehicleQuery(t); setShowVehicleList(true); }}
              placeholder="e.g. Red Toyota Corolla"
              placeholderTextColor="#777"
              autoCapitalize="words"
              returnKeyType="next"
              onSubmitEditing={() => nameRef.current?.focus()}
            />

            {showVehicleList &&
              selectedCustomerId &&
              vehicleCustomerRef.current === selectedCustomerId &&
              vehicleSuggestions.length > 0 && (
                <View style={styles.suggestionBox}>
                  {vehicleSuggestions
                    .filter(v => !vehicleQuery || v.toLowerCase().includes(vehicleQuery.toLowerCase()))
                    .slice(0, 10)
                    .map(v => (
                      <TouchableOpacity
                        key={v}
                        onPress={() => { setVehicleDetails(v); setVehicleQuery(v); setShowVehicleList(false); }}
                        style={styles.suggestionItem}
                      >
                        <Text>{v}</Text>
                      </TouchableOpacity>
                    ))}
                </View>
            )}



            {/* Payment */}
            <View style={{ zIndex: 2000, marginTop: 10 }}>
              <Text style={styles.label}>Payment Method</Text>
              <DropDownPicker
                open={openPayment}
                value={paymentMethod}
                items={[
                  { label: "Cash", value: "Cash" },
                  { label: "Mobile Payment", value: "Mobile Payment" },
                ]}
                setOpen={setOpenPayment}
                setValue={setPaymentMethod}
                placeholder="Select method"
                style={styles.dropdown}
                dropDownContainerStyle={styles.dropdownContainer}
                listMode={Platform.OS === 'web' ? 'SCROLLVIEW' : 'MODAL'}
                scrollViewProps={{ nestedScrollEnabled: true }}
              />
            </View>

            {/* Notes */}
            <Text style={styles.label}>Notes</Text>
            <TextInput
              ref={notesRef}
              style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
              value={notes}
              onChangeText={setNotes}
              multiline
              placeholder="Additional info..."
              placeholderTextColor="#777"
            />

            {/* Actions */}
            <View style={{ flexDirection: "row", gap: 8, marginTop: 20 }}>
              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: "#6a0dad", flex: 1 }]}
                onPress={addOrUpdateCartItem}
                accessibilityLabel={editingId ? "Update item" : "Add to cart"}
              >
                <Text style={styles.submitText}>{editingId ? "Update Item" : "Add to Cart"}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: "#aaa", flex: 1 }]}
                onPress={() => clearForm(true)}
                accessibilityLabel="Clear form"
              >
                <Text style={styles.submitText}>Clear</Text>
              </TouchableOpacity>
            </View>

            {!isWide && cart.length > 0 && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <TouchableOpacity style={[styles.checkoutBtn, { backgroundColor: "#4caf50", flex: 1 }]} onPress={previewAndShareCartReceipt}>
                  <Ionicons name="share-social-outline" size={20} color="#fff" />
                  <Text style={styles.checkoutBtnText}>Preview & Share</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.checkoutBtn, { backgroundColor: "#6a0dad", flex: 1 }]} onPress={submitAll}>
                  <Ionicons name="cash-outline" size={20} color="#fff" />
                  <Text style={styles.checkoutBtnText}>Charge ${totals.grandTotal}</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* TRANSACTION DETAILS BOTTOM SHEET */}
      <Modal
        visible={detailOpen}
        transparent
        onRequestClose={closeTransactionDetails}
        animationType="fade"
      >
        <View style={styles.sheetOverlay}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={closeTransactionDetails}
            style={styles.sheetBackdrop}
          />
            <View style={[styles.sheetContainer, { maxHeight: '90%' }]}>
              <View style={styles.sheetHandle} />

              {/* Header */}
              <View
                style={{
                  paddingBottom: 8,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 18, fontWeight: '800' }}>Transaction Details</Text>
                <TouchableOpacity onPress={closeTransactionDetails}>
                  <Ionicons name="close" size={26} />
                </TouchableOpacity>
              </View>

              {/* Body */}
              {detailLoading ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text>Loading…</Text>
                </View>
              ) : (
                <ScrollView contentContainerStyle={{ paddingVertical: 8, paddingBottom: 32 }}>
                {/* Meta */}
                <View style={{ marginBottom: 12 }}>
                  {!!detail?.createdAt && <Text style={{ color: "#666" }}>Date: {new Date(detail.createdAt).toLocaleString()}</Text>}
                  <Text style={{ color: "#666" }}>ID: {detail?._id}</Text>
                </View>

                {/* Customer */}
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Customer</Text>
                  <Text style={styles.cardDetail}>{detail?.customerName || '—'}</Text>
                  {!!detail?.email && <Text style={{ color: "#555" }}>{detail.email}</Text>}
                  {!!detail?.vehicleDetails && <Text style={{ color: "#555" }}>{detail.vehicleDetails}</Text>}
                </View>

                {/* Items */}
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Items</Text>
                  {isMulti(detail) ? (
                    <View>
                      {detail!.items!.map((i, idx) => {
                        const op = Number(i.originalPrice || 0);
                        const pct = Number(i.discountPercent || 0);
                        const disc = Number(i.discountAmount || (op * (pct/100)) || 0);
                        const final = Math.max(0, op - disc);
                        return (
                          <View key={idx} style={{ paddingVertical: 8, borderBottomWidth: idx === detail!.items!.length - 1 ? 0 : 1, borderColor: "#eee" }}>
                            <Text style={{ fontWeight: '700' }}>{i.serviceType || i.serviceName || "Service"}{i.specialsName ? ` • ${i.specialsName}` : ''}</Text>
                            <Text style={{ color: '#555' }}>${op.toFixed(2)} − {pct}% → ${final.toFixed(2)} • {i.paymentMethod || 'Cash'}</Text>
                            {!!i.notes && <Text style={{ marginTop: 4, color: '#777' }}>Note: {i.notes}</Text>}
                          </View>
                        );
                      })}
                    </View>
                  ) : (
                    <View>
                      <Text style={{ fontWeight: '700' }}>{detail?.serviceType || detail?.serviceName || 'Service'}{detail?.specialsName ? ` • ${detail.specialsName}` : ''}</Text>
                      <Text style={{ color: '#555', marginTop: 4 }}>
                        ${Number(detail?.originalPrice || 0).toFixed(2)}
                        {' '}− {Number(detail?.discountPercent || 0)}%
                        {' '}→ ${Number(detail?.finalPrice || Math.max(0, Number(detail?.originalPrice || 0) - Number(detail?.discountAmount || 0))).toFixed(2)}
                        {' '}• {detail?.paymentMethod || 'Cash'}
                      </Text>
                      {!!detail?.notes && <Text style={{ marginTop: 6, color: '#777' }}>Note: {detail.notes}</Text>}
                    </View>
                  )}
                </View>

                {/* Totals */}
                <View style={styles.totalsBox}>
                  {(() => {
                    const t = detailTotals(detail);
                    return (
                      <>
                        <View style={styles.totalsRow}>
                          <Text style={styles.totalsLabel}>Subtotal</Text>
                          <Text style={styles.totalsValue}>${t.subtotal.toFixed(2)}</Text>
                        </View>
                        <View style={styles.totalsRow}>
                          <Text style={styles.totalsLabel}>Discounts</Text>
                          <Text style={styles.totalsValue}>− ${t.totalDiscount.toFixed(2)}</Text>
                        </View>
                        <View style={[styles.totalsRow, { borderTopWidth: 1, borderColor: "#eee", paddingTop: 8, marginTop: 8 }]}>
                          <Text style={[styles.totalsLabel, { fontWeight: "800" }]}>Total</Text>
                          <Text style={[styles.totalsValue, { fontWeight: "800" }]}>${t.total.toFixed(2)}</Text>
                        </View>
                      </>
                    );
                  })()}
                </View>

                {/* Actions */}
                <TouchableOpacity
                  style={[styles.checkoutBtn, { backgroundColor: "#4caf50" }]}
                  onPress={async () => {
                    if (detail?.receiptPdfBase64) {
                      await shareBase64Pdf(detail.receiptPdfBase64, detail.receiptFileName || `Receipt-${detail._id}.pdf`);
                    } else {
                      await rebuildAndShareReceiptFromDetail(detail);
                    }
                  }}
                >
                  <Ionicons name="share-social-outline" size={20} color="#fff" />
                  <Text style={styles.checkoutBtnText}>
                    {detail?.receiptPdfBase64 ? 'Share Stored Receipt PDF' : 'Rebuild & Share Receipt'}
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* MANAGE SERVICES & SPECIALS MODAL */}
      <Modal
        visible={manageOpen}
        onRequestClose={() => setManageOpen(false)}
        animationType="slide"
        presentationStyle={isWide ? "formSheet" as any : "fullScreen"}
      >
        <ScrollView
          style={{ flex: 1, backgroundColor: '#fff' }}
          contentContainerStyle={{ paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={{ paddingTop: Platform.OS === 'ios' ? 55 : 30, paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: 1, borderColor: "#eee", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontSize: 18, fontWeight: "800" }}>Manage Services & Specials</Text>
            <TouchableOpacity onPress={() => setManageOpen(false)}><Ionicons name="close" size={26} /></TouchableOpacity>
          </View>

          <View style={{ padding: 20 }}>
            <Text style={styles.header}>Add or Edit Services & Specials</Text>

            {/* Add New Service */}
            <Text style={styles.label}>New Service Name</Text>
            <TextInput
              style={[styles.input, { minHeight: 48 }]}
              value={newService}
              onChangeText={setNewService}
              placeholder="e.g. Tire Shine"
              placeholderTextColor="#777"
              returnKeyType="next"
            />
            <Text style={styles.label}>Service Price ($)</Text>
            <TextInput
              style={[styles.input, { minHeight: 48 }]}
              value={newServicePrice}
              onChangeText={setNewServicePrice}
              keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
              inputMode="decimal"
              placeholder="e.g. 25.00"
              placeholderTextColor="#777"
              returnKeyType="done"
            />
            <TouchableOpacity style={styles.submitButton} onPress={handleSaveService}>
              <Text style={styles.submitText}>Save Service</Text>
            </TouchableOpacity>

            <View style={{ marginTop: 30 }} />

            {/* Add New Special */}
            <Text style={styles.label}>New Special Name</Text>
            <TextInput
              style={[styles.input, { minHeight: 48 }]}
              value={newSpecial}
              onChangeText={setNewSpecial}
              placeholder="e.g. Weekend Discount"
              placeholderTextColor="#777"
              returnKeyType="next"
            />
            <Text style={styles.label}>Discount Percent (%)</Text>
            <TextInput
              style={[styles.input, { minHeight: 48 }]}
              value={newSpecialPrice}
              onChangeText={setNewSpecialPrice}
              keyboardType="number-pad"
              inputMode="numeric"
              placeholder="e.g. 10"
              placeholderTextColor="#777"
              returnKeyType="done"
            />
            <TouchableOpacity style={styles.submitButton} onPress={handleSaveSpecial}>
              <Text style={styles.submitText}>Save Special</Text>
            </TouchableOpacity>

            {/* Existing Services */}
            <TouchableOpacity onPress={() => setShowServices(!showServices)}>
              <Text style={styles.collapsibleHeader}>
                {showServices ? '▼' : '▶'} Existing Services
              </Text>
            </TouchableOpacity>
            {showServices && (
              <>
                <TextInput
                  style={[styles.input, { minHeight: 48 }]}
                  placeholder="Search Services..."
                  placeholderTextColor="#777"
                  value={serviceSearch}
                  onChangeText={setServiceSearch}
                  returnKeyType="search"
                />
                {services
                  .filter((item) => item.name.toLowerCase().includes(serviceSearch.toLowerCase()))
                  .map((item, index) => (
                    <Animatable.View
                      key={item._id}
                      animation="fadeInUp"
                      delay={index * 50}
                      style={styles.card}
                    >
                      <Text style={styles.cardTitle}>{item.name}</Text>
                      <Text style={styles.cardDetail}>${item.price.toFixed(2)}</Text>
                      <View style={styles.buttonRow}>
                        <TouchableOpacity style={styles.editButton} onPress={() => handleEditService(item)}>
                          <Text style={styles.buttonText}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.deleteButton} onPress={() => handleDeleteService(item._id)}>
                          <Text style={styles.buttonText}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    </Animatable.View>
                  ))}
              </>
            )}

            {/* Existing Specials */}
            <TouchableOpacity onPress={() => setShowSpecials(!showSpecials)}>
              <Text style={styles.collapsibleHeader}>
                {showSpecials ? '▼' : '▶'} Existing Specials
              </Text>
            </TouchableOpacity>
            {showSpecials && (
              <>
                <TextInput
                  style={[styles.input, { minHeight: 48 }]}
                  placeholder="Search Specials..."
                  placeholderTextColor="#777"
                  value={specialSearch}
                  onChangeText={setSpecialSearch}
                  returnKeyType="search"
                />
                {specialsList
                  .filter((item) => item.name.toLowerCase().includes(specialSearch.toLowerCase()))
                  .map((item, index) => (
                    <Animatable.View
                      key={item._id}
                      animation="fadeInUp"
                      delay={index * 50}
                      style={styles.card}
                    >
                      <Text style={styles.cardTitle}>{item.name}</Text>
                      <Text style={styles.cardDetail}>{item.discountPercent}% Off</Text>
                      <View style={styles.buttonRow}>
                        <TouchableOpacity style={styles.editButton} onPress={() => handleEditSpecial(item)}>
                          <Text style={styles.buttonText}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.deleteButton} onPress={() => handleDeleteSpecial(item._id)}>
                          <Text style={styles.buttonText}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    </Animatable.View>
                  ))}
              </>
            )}
          </View>
        </ScrollView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#fff', flexGrow: 1, paddingBottom: 100, 
    ...Platform.select({
      ios: {
        padding: 20,
      },
      android: {
        paddingTop: 10,
        paddingBottom: 50,
        paddingLeft: 20,
        paddingRight: 20,
      },
      default: {
        padding: 10,
      },
    }), 
  },
  containerWide: {},
  header: { fontSize: 18, fontWeight: 'bold', color: '#6a0dad', marginBottom: 16, },
  logo: { fontSize: 18, fontWeight: 'bold', color: '#6a0dad', marginTop: 0, },
  label: { marginTop: 10, marginBottom: 4, color: '#333', fontWeight: '600' },

  posContainer: { flex: 1, backgroundColor: "#fff" },
  posContainerWide: { flexDirection: "row", gap: 16, padding: 12 },
  posLeft: { flex: 1, padding: 12 },
  posRight: { width: 420, maxWidth: "100%", padding: 12 },

  cartCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#eee",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    ...Platform.select({
      default: { marginTop: 60 },
    }),
  },
  cartHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cartTitle: { fontSize: 18, fontWeight: "800" },
  badge: { minWidth: 28, height: 28, borderRadius: 14, backgroundColor: "#6a0dad", alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  badgeText: { color: "#fff", fontWeight: "800" },
  cartRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#faf7ff",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#f0e7ff",
  },
  cartRowTitle: { fontWeight: "700" },
  cartRowSub: { color: "#555", marginTop: 2, fontSize: 12 },
  cartRowActions: { flexDirection: "row", alignItems: "center", marginLeft: 8 },
  iconBtn: { padding: 6, marginLeft: 4, borderRadius: 8, backgroundColor: "#fff", borderWidth: 1, borderColor: "#eee" },
  totalsBox: { marginTop: 16, borderRadius: 10, padding: 12, backgroundColor: "#fff", borderWidth: 1, borderColor: "#eee" },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  totalsLabel: { color: "#444" },
  totalsValue: { fontWeight: "700" },
  cartListBox: { maxHeight: 320 },
  cartDetailsToggle: {
    marginTop: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d3c2ff",
    backgroundColor: "#f5eeff",
  },
  cartDetailsToggleText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6a0dad",
  },

  checkoutBtn: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  checkoutBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },

  checkoutBar: {
    ...Platform.select({
      ios: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        padding: 12,
        backgroundColor: "#fff",
        borderTopWidth: 1,
        borderColor: "#eee",
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
      },
  
      android: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        padding: 12,
        backgroundColor: "#fff",
        borderTopWidth: 1,
        borderColor: "#eee",
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
      },
  
      default: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        padding: 12,
        backgroundColor: "#fff",
        borderTopWidth: 1,
        borderColor: "#eee",
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
      },
    }),
  },  
  checkoutBtnSmall: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 10 },
  checkoutBtnSmallText: { color: "#fff", fontWeight: "800" },

  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10,
    backgroundColor: '#fafafa', marginBottom: 12,
  },
  dropdown: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    backgroundColor: '#fafafa', paddingHorizontal: 10, marginBottom: 12,
  },
  dropdownContainer: { borderColor: '#ddd', borderWidth: 1, borderRadius: 8, backgroundColor: '#fafafa' },
  submitButton: {
    backgroundColor: '#6a0dad', paddingVertical: 14, borderRadius: 8, alignItems: 'center', marginTop: 20,
  },
  submitText: { color: '#fff', fontWeight: '600', fontSize: 16 },

  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  card: {
    backgroundColor: '#f9f9ff', borderRadius: 10, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  cardTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 4, color: '#333' },
  cardDetail: { fontSize: 14, marginBottom: 12, color: '#555' },
  buttonRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  editButton: { backgroundColor: '#4CAF50', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6 },
  deleteButton: { backgroundColor: '#f44336', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6 },
  buttonText: { color: '#fff', fontWeight: '600' },
  suggestionBox: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#ccc', borderRadius: 6,
    marginTop: -5, paddingHorizontal: 8, paddingVertical: 4, zIndex: 9999, maxHeight: 1000,
  },
  suggestionItem: { paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  collapsibleHeader: { fontWeight: '700', fontSize: 16, marginTop: 20, marginBottom: 8, color: '#6a0dad' },

  // Sticky header for Transactions FlatList
  stickyHeader: {
    paddingHorizontal: 12,
    paddingTop: 0,
    paddingBottom: 6,
    backgroundColor: '#fff',
    zIndex: 10,
    ...Platform.select({
      ios: { paddingTop: 20, marginTop: 0, },
      android: { paddingTop: 10, marginBottom: 0, marginRight: -44},
      default: { marginTop: 60, marginBottom: 0, marginRight:-44 },
    }),
  },
  stickyHeaderElevated: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
    ...Platform.select({
      android: { elevation: 3 },
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 3 },
      },
      default: { boxShadow: '0 2px 6px rgba(0,0,0,0.06)' } as any,
    }),
  },
  stickyHeaderTitle: { 
    fontSize: 30, 
    fontWeight: '800', 
    color: '#6a0dad', 
  },
  stickyHeaderSubtitle: { color: '#666', marginTop: 4 },

  // Floating Action Button (Transactions speed-dial)
  fabTx: {
    position: "absolute",
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#6a0dad",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  fabContainerTx: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    ...Platform.select({ ios: { zIndex: 1000 }, android: { elevation: 10 } }),
    ...Platform.select({
      ios: { marginBottom: -41, marginRight: -44 },
      android: { marginBottom: 10, marginRight: -44},
      default: { marginBottom: 0, marginRight:-44 },
    }),
  },
  fabBackdrop: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
  },
  smallFab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    marginBottom: 10,
    marginLeft: 10,
  },
  fabOptionRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginBottom: 6,
    marginRight: 8,
  },
  fabOptionLabel: {
    marginRight: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee',
    color: '#333',
    fontWeight: '600',
  },

  // (Legacy) Single FAB style; not used with speed-dial
  fab: {
    position: "absolute",
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#6a0dad",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },


  // Bottom sheet shared styles
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 28 : 20,
    maxHeight: '90%',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ccc',
    marginBottom: 8,
  },
  
});
