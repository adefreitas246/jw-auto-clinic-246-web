import { useAuth } from '@/context/AuthContext';
import { Ionicons } from "@expo/vector-icons";
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import * as Animatable from 'react-native-animatable';
import DropDownPicker from 'react-native-dropdown-picker';


export default function TransactionsScreen() {
  const { user } = useAuth();

  const allTabs = ['transaction', 'management'] as const;
  const visibleTabs = allTabs.filter((tab) => {
    if (tab === 'management') return user?.role === 'admin';
    return true;
  });
  const [activeTab, setActiveTab] = useState<typeof visibleTabs[number]>('transaction');


  const [serviceType, setServiceType] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [openService, setOpenService] = useState(false);
  const [openPayment, setOpenPayment] = useState(false);

  const [originalPrice, setOriginalPrice] = useState('');
  const [discountAmount, setDiscountAmount] = useState('');
  const [finalPrice, setFinalPrice] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [vehicleDetails, setVehicleDetails] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [email, setEmail] = useState('');
  const [discountPercent, setDiscountPercent] = useState('');
  const [specials, setSpecials] = useState<any>(null);
  const [openSpecials, setOpenSpecials] = useState(false);
  const [notes, setNotes] = useState('');

  const [newService, setNewService] = useState('');
  const [newSpecial, setNewSpecial] = useState('');
  const [newServicePrice, setNewServicePrice] = useState('');
  const [newSpecialPrice, setNewSpecialPrice] = useState('');

  const [cartModalVisible, setCartModalVisible] = useState(false);

  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  useEffect(() => {
    let parsedOriginal = parseFloat(originalPrice) || 0;
    let percent = 0;

    setDiscountPercent(percent.toString());

    const amount = parsedOriginal * (percent / 100);
    setDiscountAmount(amount.toFixed(2));
    const final = parsedOriginal - amount;
    setFinalPrice(final.toFixed(2));
  }, [originalPrice, specials]);


  const isValidEmail = (s?: string) => !!s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim());

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

  const ensureCustomerId = async (name: string, emailAddr: string, vehicle: string): Promise<string> => {
    if (!user?.token) throw new Error('You are logged out. Please sign in and try again.');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.token}`,
    };

    const body = {
      name: (name || 'Customer').trim(),
      email: (emailAddr || '').trim(),
      vehicleDetails: (vehicle || '').trim(), // 🔴 REQUIRED by schema
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





  const validateTransactionForm = () => {
    if (!serviceTypeId) {
      alert('Missing Info, Please select a service type.');
      return false;
    }
    if (!originalPrice || isNaN(Number(originalPrice))) {
      alert('Invalid Price, Please enter a valid original price.');
      return false;
    }
    if (!paymentMethod) {
      alert('Missing Info, Please select a payment method.');
      return false;
    }
    if (!customerName.trim()) {
      alert('Missing Info, Please enter the customer name.');
      return false;
    }
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) {
      alert('Invalid Email, Please enter a valid email address.');
      return false;
    }
    if (!specialsId) {
      alert('Missing Info, Please select special as none or select a specific one.');
      return false;
    }
    if (!vehicleDetails.trim()) {
      alert('Missing Info, Please enter vehicle details.');
      return false;
    }
    return true;
  };

  type CartItem = {
    id: string;
    serviceTypeId: string | null;
    serviceName: string;
    specialsId?: string | null;
    specialsName?: string | null;
    originalPrice: number;        // stored as numbers for math
    discountPercent: number;
    discountAmount: number;
    finalPrice: number;
    paymentMethod: string;
    customerName?: string | null;
    email?: string | null;
    vehicleDetails?: string | null;
    notes?: string | null;
  };
  
  const [cart, setCart] = useState<CartItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Recompute your single-form discount / final price as user types
  useEffect(() => {
    const op = parseFloat(originalPrice || "0") || 0;
    const dp = parseFloat(discountPercent || "0") || 0;
    const dAmt = +(op * (dp / 100)).toFixed(2);
    const fAmt = +(op - dAmt).toFixed(2);
    setDiscountAmount(dAmt.toFixed(2));
    setFinalPrice(fAmt.toFixed(2));
  }, [originalPrice, discountPercent]);
  
  const clearForm = (keepCustomer = true) => {
    setServiceTypeId(null);
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
    setSpecialsId("");
    setVehicleDetails("");
    setNotes("");
    setEditingId(null);
  };
  
  const addOrUpdateCartItem = () => {
    // Validate minimal fields
    if (!serviceTypeId && !selectedServiceObj?.name) {
      Alert.alert("Missing service", "Please select a Service Type.");
      return;
    }
    const op = parseFloat(originalPrice || "0");
    if (!(op > 0)) {
      Alert.alert("Invalid price", "Original Price must be greater than 0.");
      return;
    }
    if (!paymentMethod) {
      Alert.alert("Payment method", "Please choose a payment method.");
      return;
    }
  
    const dp = parseFloat(discountPercent || "0") || 0;
    const dAmt = +(op * (dp / 100)).toFixed(2);
    const fAmt = +(op - dAmt).toFixed(2);
  
    const item: CartItem = {
      id: editingId || Math.random().toString(36).slice(2),
      serviceTypeId: serviceTypeId ?? null,
      serviceName: selectedServiceObj?.name ?? serviceType ?? "Service",
      specialsId: specialsId ?? null,
      specialsName: selectedSpecialObj?.name ?? specials ?? null,
      originalPrice: op,
      discountPercent: dp,
      discountAmount: dAmt,
      finalPrice: fAmt,
      paymentMethod,
      customerName: customerName ?? "",
      email: email ?? "",
      vehicleDetails: vehicleDetails ?? "",
      notes: notes ?? "",
    };
  
    setCart(prev => {
      if (editingId) {
        return prev.map(ci => (ci.id === editingId ? item : ci));
      }
      return [item, ...prev];
    });
  
    // POS keeps customer by default; only clear line item fields
    clearForm(true);
  };

  // Derive a human-friendly specials label for the current cart
  const getOverallSpecials = () => {
    const names = cart
      .map(i => (i.specialsName || "").trim())
      .filter(Boolean);

    if (cart.length === 1) return names[0] || "None";

    const uniq = Array.from(new Set(names));
    if (uniq.length === 0) return "None";
    if (uniq.length === 1) return uniq[0];
    return "Mixed";
  };

  
  const editCartItem = (id: string) => {
    const ci = cart.find(x => x.id === id);
    if (!ci) return;
    setEditingId(ci.id);
    setServiceTypeId(ci.serviceTypeId);
    setSpecialsId(ci.specialsId ?? "");
    setOriginalPrice(ci.originalPrice.toString());
    setDiscountPercent(ci.discountPercent.toString());
    setPaymentMethod(ci.paymentMethod);
    setCustomerName(ci.customerName ?? "");
    setEmail(ci.email ?? "");
    setVehicleDetails(ci.vehicleDetails ?? "");
    setNotes(ci.notes ?? "");
    setDiscountAmount(ci.discountAmount.toFixed(2));
    setFinalPrice(ci.finalPrice.toFixed(2));
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
  
  // Submit all cart items to API
  const submitAll = async () => {
    if (cart.length === 0) {
      Alert.alert("Cart is empty", "Add at least one item to submit.");
      return;
    }
  
    const { resolvedEmail, resolvedName, resolvedVehicle } = deriveSubmissionContext();
  
    if (!resolvedName) {
      Alert.alert("Missing name", "Please enter the customer's name.");
      return;
    }
    if (!resolvedVehicle) {
      Alert.alert("Missing vehicle details", "Please enter vehicle details (required to create the customer).");
      return;
    }
    if (!isValidEmail(resolvedEmail)) {
      Alert.alert("Missing email", "Please enter a valid customer email (form or any cart line).");
      return;
    }
  
    const badPM = cart.find((i) => !i.paymentMethod);
    if (badPM) {
      Alert.alert("Payment method", "Every cart item must have a payment method.");
      return;
    }
  
    let customerId: string;
    try {
      customerId = await ensureCustomerId(resolvedName, resolvedEmail, resolvedVehicle);
    } catch (e: any) {
      Alert.alert("Customer required", e?.message || "Please select or create a customer.");
      return;
    }
  
    const payload = {
      customerName: resolvedName,
      email: resolvedEmail,
      vehicleDetails: resolvedVehicle,
      customer: customerId,
      items: cart.map((i) => ({
        serviceTypeId: i.serviceTypeId,
        serviceName: i.serviceName,
        specialsId: i.specialsId,
        specialsName: i.specialsName,
        originalPrice: i.originalPrice,
        discountPercent: i.discountPercent,
        discountAmount: i.discountAmount,
        notes: i.notes,
        paymentMethod: i.paymentMethod, // "Cash" | "Mobile Payment"
        customer: customerId,
      })),
    };
  
    try {
      const res = await fetch("https://jw-auto-clinic-246.onrender.com/api/transactions/batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user?.token}`,
        },
        body: JSON.stringify(payload),
      });
  
      const text = await res.text();
      let data: any = null;
      try { data = text ? JSON.parse(text) : null; } catch {}
  
      if (!res.ok) throw new Error(data?.error || data?.message || text || "Batch save failed");
  
      const saved = Number(data?.savedCount) || 0;
      if (saved <= 0) {
        Alert.alert("Nothing saved", "No items were saved. Please review your cart and try again.");
        return;
      }
  
      Alert.alert(
        "Success",
        `Submitted ${saved} item${saved > 1 ? "s" : ""} and emailed a receipt to ${resolvedEmail}.`
      );
  
      setCart([]);
      clearForm(false);
    } catch (e: any) {
      console.error(e);
      Alert.alert("Error", e?.message || "Could not submit transactions.");
    }
  };
  
  
  
  

  // Combined receipt using your existing single-receipt helper
  const previewAndShareCartReceipt = () => {
    if (cart.length === 0) {
      Alert.alert("Nothing to preview", "Add items to the cart first.");
      return;
    }
  
    const { resolvedEmail, resolvedName, resolvedVehicle } = deriveSubmissionContext();
    const specialsLabel = getOverallSpecials();
  
    const lines = cart.map((i, idx) =>
      `${idx + 1}. ${i.serviceName}${i.specialsName ? ` (${i.specialsName})` : " (None)"} - $${i.originalPrice.toFixed(2)} - ${i.discountPercent}% → $${i.finalPrice.toFixed(2)}`
    ).join("\n");
  
    generateAndShareReceipt({
      customerName: resolvedName || customerName,
      vehicleDetails: resolvedVehicle || vehicleDetails,
      email: resolvedEmail || email,
      employeeName: "JW Auto Clinic 246",
      serviceType: cart.length === 1 ? cart[0].serviceName : `Multiple items (${cart.length})`,
      specials: selectedSpecialObj?.name || (specialsId ? (specialItems.find(s => s.value === specialsId)?.raw.name || 'None') : 'None'),                          // 🔴 ensure Specials is never blank
      paymentMethod: cart[0]?.paymentMethod || paymentMethod || "Mixed",
      originalPrice: totals.subtotal,
      discountPercent: "", // total view
      discountAmount: totals.totalDiscount,
      finalPrice: totals.grandTotal,
      notes: `${notes || ""}\n\nItems:\n${lines}\n\nGrand Total: $${totals.grandTotal}`,
    });
  };
  
  
  
  
  // Combined receipt using your existing single-receipt helper
  {/* Cart List */}
  {cart.length === 0 ? (
    <Text style={{ color: "#666", marginTop: 8 }}>
      No items yet. Add items from the left.
    </Text>
  ) : (
    <View style={styles.cartListBox}>
      <FlatList
        data={cart}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.cartRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cartRowTitle}>
                {item.serviceName}
                {item.specialsName ? ` • ${item.specialsName}` : ""}
              </Text>
              <Text style={styles.cartRowSub}>
                ${item.originalPrice.toFixed(2)} − {item.discountPercent}% → $
                {item.finalPrice.toFixed(2)}
              </Text>
            </View>
            <View style={styles.cartRowActions}>
              <TouchableOpacity onPress={() => editCartItem(item.id)} style={styles.iconBtn}>
                <Ionicons name="create-outline" size={18} color="#6a0dad" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => removeCartItem(item.id)} style={styles.iconBtn}>
                <Ionicons name="trash-outline" size={18} color="#d11a2a" />
              </TouchableOpacity>
            </View>
          </View>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        contentContainerStyle={{ paddingBottom: 6 }}
      />
    </View>
  )}
  

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
      fetchServices(); // reload list
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
          headers: {
            Authorization: `Bearer ${user.token}`,
          },
        });
        if (!res.ok) throw new Error('Failed to delete service');
        alert('Service deleted!');
        fetchServices(); // Refresh the list
      } catch (err: any) {
        alert(err.message);
      }
    };
  
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('Are you sure you want to delete this service?');
      if (confirmed) await confirmDelete();
    } else {
      Alert.alert(
        'Confirm Deletion',
        'Are you sure you want to delete this service?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: confirmDelete },
        ],
        { cancelable: true }
      );
    }
  };

  const handleEditService = (item: { _id: string; name: string; price: number }) => {
    setEditItem(item);
    setEditValue(item.price.toString());
  };

  const [services, setServices] = useState<{ _id: string; name: string; price: number }[]>([]);
  const [specialsList, setSpecialsList] = useState<{ _id: string; name: string; discountPercent: number }[]>([]);
  const [editItem, setEditItem] = useState<{ _id: string; name: string; price?: number; discountPercent?: number } | null>(null);
  const [editValue, setEditValue] = useState('');

  const fetchServices = async () => {
    const res = await fetch("https://jw-auto-clinic-246.onrender.com/api/services", {
      headers: { Authorization: `Bearer ${user!.token}` },
    });
    const data = await res.json();
    setServices(data);
  };

  const fetchSpecials = async () => {
    const res = await fetch("https://jw-auto-clinic-246.onrender.com/api/specials", {
      headers: { Authorization: `Bearer ${user!.token}` },
    });
    const data = await res.json();
    setSpecialsList(data);
  };

  useEffect(() => {
    if (activeTab === 'management') {
      fetchServices();
      fetchSpecials();
    }
  }, [activeTab]);

  
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
      fetchSpecials(); // reload list
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
          headers: {
            Authorization: `Bearer ${user.token}`,
          },
        });
        if (!res.ok) throw new Error('Failed to delete special');
        alert('Special deleted!');
        fetchSpecials(); // Refresh the list
      } catch (err: any) {
        alert(err.message);
      }
    };
  
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('Are you sure you want to delete this special?');
      if (confirmed) await confirmDelete();
    } else {
      Alert.alert(
        'Confirm Deletion',
        'Are you sure you want to delete this special?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: confirmDelete },
        ],
        { cancelable: true }
      );
    }
  };


  interface ServiceItem {
    label: string;
    value: string; // _id
    raw: {
      _id: string;
      name: string;
      price: number;
    };
  }
  
  interface SpecialItem {
    label: string;
    value: string; // _id
    raw: {
      _id: string;
      name: string;
      discountPercent: number;
    };
  }
  
  const [serviceItems, setServiceItems] = useState<ServiceItem[]>([]);
  const [specialItems, setSpecialItems] = useState<SpecialItem[]>([]);  

  const [serviceTypeId, setServiceTypeId] = useState<string | null>(null);
  const [specialsId, setSpecialsId] = useState<string | null>(null);

  const selectedServiceObj = serviceItems.find(item => item.value === serviceTypeId)?.raw;
  const selectedSpecialObj = specialItems.find(item => item.value === specialsId)?.raw;

  const [selectedService, setSelectedService] = useState(null);
  const [selectedSpecial, setSelectedSpecial] = useState(null);

  const [price, setPrice] = useState('');
  const [discount, setDiscount] = useState('');

  useEffect(() => {
    const fetchDropdownData = async () => {
      try {
        const [servicesRes, specialsRes] = await Promise.all([
          fetch('https://jw-auto-clinic-246.onrender.com/api/services'),
          fetch('https://jw-auto-clinic-246.onrender.com/api/specials')
        ]);
  
        const servicesData = await servicesRes.json();
        const specialsData = await specialsRes.json();
  
        const serviceOptions = servicesData.map((s: { _id: string; name: string; price: number | { min: number; max: number } | null }) => {
          let displayPrice = 'N/A';
  
          if (typeof s.price === 'number') {
            displayPrice = `$${s.price.toFixed(2)}`;
          } else if (s.price && typeof s.price === 'object' && 'min' in s.price && 'max' in s.price) {
            displayPrice = `$${s.price.min} - $${s.price.max}`;
          }
  
          return {
            label: `${s.name} - ${displayPrice}`,
            value: s._id,
            raw: s
          };
        });
  
        const specialOptions = specialsData.map((s: { _id: string; name: string; discountPercent?: number }) => ({
          label: s.discountPercent != null
            ? `${s.name} - ${s.discountPercent}%`
            : `${s.name}`,
          value: s._id,
          raw: s
        }));
  
        setServiceItems(serviceOptions);
        setSpecialItems(specialOptions);
      } catch (err) {
        console.error('Error fetching services or specials:', err);
      }
    };
  
    fetchDropdownData();
  }, []);
  

  // Automatically set price from selected service
    useEffect(() => {
      if (serviceType) {
        setOriginalPrice(serviceType.price?.toString() ?? '');
      }
    }, [serviceType]);

    useEffect(() => {
      if (selectedServiceObj) {
        setOriginalPrice(selectedServiceObj.price?.toString() ?? '');
      }
    }, [serviceTypeId]);

    // Automatically set discount from selected special
    useEffect(() => {
    if (specials) {
      setDiscountPercent(specials.discountPercent?.toString() ?? '');
    }
  }, [specials]);

  useEffect(() => {
    if (selectedSpecialObj) {
      setDiscountPercent(selectedSpecialObj.discountPercent?.toString() ?? '');
    }
  }, [specialsId]);


  useEffect(() => {
    if (originalPrice && discountPercent) {
      const price = parseFloat(originalPrice);
      const discount = parseFloat(discountPercent);
      const amount = price * (discount / 100);
      setDiscountAmount(amount.toFixed(2));
      setFinalPrice((price - amount).toFixed(2));
    } else {
      setDiscountAmount('0.00');
      setFinalPrice(originalPrice || '0.00');
    }
  }, [originalPrice, discountPercent]);


  const [customerSuggestions, setCustomerSuggestions] = useState<{ _id: string; name: string; email: string; customerCode: string }[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

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
            headers: {
              Authorization: `Bearer ${user!.token}`,
            },
          }
        );
  
        const data = await res.json();
        setCustomerSuggestions(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Customer search failed:', err);
      }
    }, 300);
  
    return () => clearTimeout(delayDebounce);
  }, [customerName]);
  
  

  const [showServices, setShowServices] = useState(true);
  const [showSpecials, setShowSpecials] = useState(true);
  const [serviceSearch, setServiceSearch] = useState('');
  const [specialSearch, setSpecialSearch] = useState('');


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
  
    const now = new Date();
    const date = now.toLocaleString();
  
    // Try to load logo (optional)
    let logoBase64 = "";
    try {
      const logoAsset = Asset.fromModule(require('@/assets/images/icon.png'));
      await logoAsset.downloadAsync();
      if (logoAsset.localUri) {
        logoBase64 = await FileSystem.readAsStringAsync(logoAsset.localUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }
    } catch (e) {
      console.warn('⚠️ Failed to load or encode logo:', e);
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
          </style>
        </head>
        <body>
          <div class="header">
            ${logoBase64 ? `<img src="data:image/png;base64,${logoBase64}" class="logo" />` : ''}
            <div class="company-info">
              <h1>JW Auto Clinic 246</h1>
              <p>Professional Car Wash & Detailing</p>
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
              <tr><th>Discount (${discountPercent}%)</th><td>-$${parseFloat(discountAmount).toFixed(2)}</td></tr>
              <tr class="total-row"><th>Total</th><td>$${parseFloat(finalPrice).toFixed(2)}</td></tr>
            </table>
  
            <div class="notes">
              <strong>Notes:</strong><br/>
              ${notes || '—'}
            </div>
          </div>
        </body>
      </html>
    `;
  
    try {
      const { uri } = await Print.printToFileAsync({ html, base64: false });
  
      // ✅ Don’t try to add PDFs to the photo library (MediaLibrary). Use Sharing or SAF.
      if (Platform.OS === 'android') {
        try {
          const saf = FileSystem.StorageAccessFramework;
          const perm = await saf.requestDirectoryPermissionsAsync();
          if (perm.granted) {
            const filename = `JW_Auto_Receipt_${Date.now()}.pdf`;
            const fileUri = await saf.createFileAsync(perm.directoryUri, filename, 'application/pdf');
            const pdfBase64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
            await FileSystem.writeAsStringAsync(fileUri, pdfBase64, { encoding: FileSystem.EncodingType.Base64 });
          }
        } catch (safErr) {
          console.warn('⚠️ Save-to-folder failed (SAF):', safErr);
        }
      }
  
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          UTI: 'com.adobe.pdf',
          mimeType: 'application/pdf',
        });
      } else {
        Alert.alert('Receipt ready', `PDF generated at:\n${uri}`);
      }
    } catch (err: any) {
      console.error('❌ PDF generation error:', err);
      alert(`Failed to generate or share receipt: ${err.message}`);
    }
  }
  
  


  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#fff' }}
      behavior={Platform.select({ ios: 'padding', android: undefined })}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
    >
      <View style={[styles.container, isWide && styles.containerWide]}>
        {/* Tab Switcher */}
        {visibleTabs.length > 1 ? (
          <View style={styles.tabSwitcher}>
            {visibleTabs.map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[styles.tabButton, activeTab === tab && styles.tabButtonActive]}
                onPress={() => setActiveTab(tab)}
                accessibilityRole="button"
                accessibilityLabel={tab === 'transaction' ? 'Add Transaction tab' : 'Manage Services tab'}
              >
                <Text style={[styles.tabButtonText, activeTab === tab && styles.tabButtonTextActive]}>
                  {tab === 'transaction' ? 'Add Transaction' : 'Manage Services'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          Platform.OS !== 'web' && <View style={{ height: 50 }} />
        )}
  
        {/* TRANSACTION TAB */}
        {activeTab === "transaction" && (
          <View style={[styles.posContainer, isWide && styles.posContainerWide]}>
            {/* LEFT: Entry form (scrolls on all devices) */}
            <ScrollView
              style={styles.posLeft}
              contentContainerStyle={{ padding: 12, paddingBottom: isWide ? 24 : 140 }}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.header}>
                <Text style={styles.logo}>Add New Transaction</Text>
              </View>
  
              {/* Service Type */}
              <View style={{ zIndex: Platform.OS === "web" ? 3000 : undefined }}>
                <Text style={styles.label}>Service Type</Text>
                <DropDownPicker
                  open={openService}
                  value={serviceTypeId}
                  items={serviceItems}
                  setOpen={setOpenService}
                  setValue={setServiceTypeId}
                  placeholder="Select service"
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
                  listMode="SCROLLVIEW"
                  scrollViewProps={{
                    nestedScrollEnabled: true,
                    keyboardShouldPersistTaps: "handled",
                    showsVerticalScrollIndicator: true,
                    persistentScrollbar: true,
                  }}
                />
              </View>
  
              {/* Price & Discount */}
              <Text style={styles.label}>Original Price ($)</Text>
              <TextInput
                style={[styles.input, { minHeight: 48 }]}
                value={originalPrice}
                keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
                inputMode="decimal"
                returnKeyType="next"
                placeholder="e.g. 50.00"
                placeholderTextColor="#777"
                onChangeText={(text) => {
                  const sanitized = text.replace(/[^0-9.]/g, "").replace(/(\..*?)\..*/g, "$1");
                  setOriginalPrice(sanitized);
                }}
              />
  
              <Text style={styles.label}>Discount Percent (%)</Text>
              <TextInput
                style={[styles.input, { minHeight: 48 }]}
                value={discountPercent}
                keyboardType="number-pad"
                inputMode="numeric"
                returnKeyType="done"
                placeholder="e.g. 10"
                placeholderTextColor="#777"
                onChangeText={(text) => setDiscountPercent(text.replace(/[^0-9]/g, ""))}
              />
  
              {/* Payment Method */}
              <View style={{ zIndex: 2000 }}>
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
                  listMode="SCROLLVIEW"
                  scrollViewProps={{ nestedScrollEnabled: true }}
                />
              </View>
  
              {/* Customer */}
              <Text style={styles.label}>Customer Name</Text>
              <TextInput
                style={[styles.input, { minHeight: 48 }]}
                value={customerName ?? ""}
                autoCapitalize="words"
                returnKeyType="next"
                onChangeText={async (text) => {
                  setCustomerName(text);
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
                      console.error("Error fetching suggestions:", err);
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
                style={[styles.input, { minHeight: 48 }]}
                value={email ?? ""}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                placeholder="e.g. jane@example.com"
                placeholderTextColor="#777"
              />
  
              {/* JW Discount (read-only) */}
              <Text style={styles.label}>JW Auto Clinic Discount (%)</Text>
              <TextInput style={[styles.input, { backgroundColor: "#eee", minHeight: 48 }]} value={discountPercent} editable={false} />
  
              <Text style={styles.label}>Discount Amount ($)</Text>
              <TextInput style={[styles.input, { backgroundColor: "#eee", minHeight: 48 }]} value={discountAmount} editable={false} />
  
              {/* <Text style={[styles.label, { fontSize: 16, marginTop: 10 }]}>
                Final Price: ${finalPrice}
              </Text> */}
  
              {/* Specials */}
              <View style={{ zIndex: 1000 }}>
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
                  listMode="SCROLLVIEW"
                  scrollViewProps={{
                    nestedScrollEnabled: true,
                    keyboardShouldPersistTaps: "handled",
                    showsVerticalScrollIndicator: true,
                    persistentScrollbar: true,
                  }}
                />
              </View>
  
              {/* Vehicle + Notes */}
              <Text style={styles.label}>Vehicle Details</Text>
              <TextInput
                style={[styles.input, { minHeight: 48 }]}
                value={vehicleDetails}
                onChangeText={setVehicleDetails}
                placeholder="e.g. Red Toyota Corolla"
                placeholderTextColor="#777"
                returnKeyType="next"
              />
  
              <Text style={styles.label}>Notes</Text>
              <TextInput
                style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                value={notes}
                onChangeText={setNotes}
                multiline
                placeholder="Additional info..."
                placeholderTextColor="#777"
              />
  
              {/* Add/Update & Clear */}
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
            </ScrollView>
  
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
  
                  {/* Cart List */}
                  {cart.length === 0 ? (
                    <Text style={{ color: "#666", marginTop: 8 }}>No items yet. Add items from the left.</Text>
                  ) : (
                    <FlatList
                      data={cart}
                      keyExtractor={(item) => item.id}
                      renderItem={({ item }) => (
                        <View style={styles.cartRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.cartRowTitle}>
                              {item.serviceName}{item.specialsName ? ` • ${item.specialsName}` : ""}
                            </Text>
                            <Text style={styles.cartRowSub}>
                              ${item.originalPrice.toFixed(2)} − {item.discountPercent}% → ${item.finalPrice.toFixed(2)}
                            </Text>
                          </View>
                          <View style={styles.cartRowActions}>
                            <TouchableOpacity onPress={() => editCartItem(item.id)} style={styles.iconBtn} accessibilityLabel="Edit item">
                              <Ionicons name="create-outline" size={20} color="#6a0dad" />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => removeCartItem(item.id)} style={styles.iconBtn} accessibilityLabel="Remove item">
                              <Ionicons name="trash-outline" size={20} color="#d11a2a" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                      ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                      style={{ marginTop: 12 }}
                    />
                  )}
  
                  {/* Totals */}
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
  
                  {/* Actions */}
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
  
            {/* Sticky bottom bar on small screens: shows total + opens Cart modal */}
            {!isWide && cart.length > 0 && (
              <View style={styles.checkoutBar}>
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
        )}
  
        {/* MANAGEMENT TAB */}
        {activeTab === 'management' && (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
            keyboardShouldPersistTaps="handled"
          >
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
                  .filter((item) =>
                    item.name.toLowerCase().includes(serviceSearch.toLowerCase())
                  )
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
                  .filter((item) =>
                    item.name.toLowerCase().includes(specialSearch.toLowerCase())
                  )
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
          </ScrollView>
        )}
      </View>
  
      {/* EDIT MODAL (unchanged) */}
      {editItem && (
        <View style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center',
          padding: 20,
        }}>
          <View style={{
            backgroundColor: 'white', padding: 20, borderRadius: 12, width: '100%',
          }}>
            <Text style={{ fontWeight: 'bold', marginBottom: 10 }}>
              Edit {editItem.discountPercent !== undefined ? 'Special' : 'Service'}: {editItem.name}
            </Text>
            <TextInput
              style={[styles.input, { minHeight: 48 }]}
              value={editValue}
              onChangeText={setEditValue}
              keyboardType={editItem.discountPercent !== undefined ? 'number-pad' : (Platform.OS === 'ios' ? 'decimal-pad' : 'numeric')}
              inputMode={editItem.discountPercent !== undefined ? 'numeric' : 'decimal'}
              placeholder={editItem.discountPercent !== undefined ? 'Discount %' : 'Price $'}
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
      )}
  
      {/* CART MODAL (mobile-friendly full screen) */}
      {!isWide && (
        <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <View
            style={{
              display: cartModalVisible ? 'flex' : 'none',
              position: 'absolute',
              top: 10, left: 0, right: 0, bottom: 0,
              backgroundColor: '#fff',
              height: "88%",
            }}
          >
            {/* Header */}
            <View style={{ paddingTop: Platform.OS === 'ios' ? 44 : 24, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderColor: '#eee', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 18, fontWeight: '800' }}>Cart</Text>
              <TouchableOpacity onPress={() => setCartModalVisible(false)} accessibilityLabel="Close cart">
                <Ionicons name="close" size={26} color="#333" />
              </TouchableOpacity>
            </View>
  
            {/* Content */}
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
                    <View style={styles.cartRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cartRowTitle}>
                          {item.serviceName}{item.specialsName ? ` • ${item.specialsName}` : ""}
                        </Text>
                        <Text style={styles.cartRowSub}>
                          ${item.originalPrice.toFixed(2)} − {item.discountPercent}% → ${item.finalPrice.toFixed(2)}
                        </Text>
                      </View>
                      <View style={styles.cartRowActions}>
                        <TouchableOpacity onPress={() => { setCartModalVisible(false); editCartItem(item.id); }} style={styles.iconBtn} accessibilityLabel="Edit item">
                          <Ionicons name="create-outline" size={20} color="#6a0dad" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => removeCartItem(item.id)} style={styles.iconBtn} accessibilityLabel="Remove item">
                          <Ionicons name="trash-outline" size={20} color="#d11a2a" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                  ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                  contentContainerStyle={{ paddingBottom: 12 }}
                  showsVerticalScrollIndicator
                />
              )}
            </View>
  
            {/* Footer actions */}
            <View style={{ padding: 12, borderTopWidth: 1, borderColor: '#eee' }}>
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
    </KeyboardAvoidingView>
  );
  
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: '#fff', flexGrow: 1, paddingBottom: 100, },
  containerWide: {},
  header: { fontSize: 18, fontWeight: 'bold', color: '#6a0dad', marginBottom: 16, },
  logo: { fontSize: 18, fontWeight: 'bold', color: '#6a0dad', marginTop: 0, },
  label: { marginTop: 10, marginBottom: 4, color: '#333', fontWeight: '600' },


  posContainer: {
    flex: 1,
    backgroundColor: "#fff",
  },
  posContainerWide: {
    flexDirection: "row",
    gap: 16,
    padding: 12,
  },
  posLeft: {
    flex: 1,
    padding: 12,
  },
  posRight: {
    width: 420, // nice POS sidebar width; ignored on phones
    maxWidth: "100%",
    padding: 12,
  },
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
  },
  cartHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cartTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  badge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#6a0dad",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  badgeText: {
    color: "#fff",
    fontWeight: "800",
  },
  cartRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#faf7ff",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#f0e7ff",
  },
  cartRowTitle: {
    fontWeight: "700",
  },
  cartRowSub: {
    color: "#555",
    marginTop: 2,
    fontSize: 12,
  },
  cartRowActions: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 8,
  },
  iconBtn: {
    padding: 6,
    marginLeft: 4,
    borderRadius: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#eee",
  },
  totalsBox: {
    marginTop: 16,
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#eee",
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  totalsLabel: {
    color: "#444",
  },
  totalsValue: {
    fontWeight: "700",
  },
  cartListBox: {
    maxHeight: 320,       // keeps actions visible; adjust as you like
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
  checkoutBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
  },
  checkoutBar: {
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
  checkoutBtnSmall: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
  },
  checkoutBtnSmallText: {
    color: "#fff",
    fontWeight: "800",
  },
  /* keep your existing styles.dropdown, styles.dropdownContainer, styles.input, styles.label, styles.header, styles.logo, styles.submitButton, styles.submitText, styles.suggestionBox, styles.suggestionItem, etc. */
  


  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#fafafa',
    marginBottom: 12,
  },
  dropdown: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#fafafa',
    paddingHorizontal: 10,
    marginBottom: 12,
  },
  dropdownContainer: {
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 8,
    backgroundColor: '#fafafa',
  },
  submitButton: {
    backgroundColor: '#6a0dad',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  submitText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  tabSwitcher: {
    flexDirection: 'row',
    marginBottom: 20,
    justifyContent: 'center',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: '#eee',
    borderRadius: 8,
    marginHorizontal: 5,
    alignItems: 'center',
    marginTop: 40, 
    marginBottom: 10,
  },
  tabButtonActive: {
    backgroundColor: '#6a0dad',
  },
  tabButtonText: {
    fontWeight: '600',
    color: '#333',
  },
  tabButtonTextActive: {
    color: '#fff',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#fdfdfd',
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#333',
  },
  cardDetail: {
    fontSize: 14,
    marginBottom: 12,
    color: '#555',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  editButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  deleteButton: {
    backgroundColor: '#f44336',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },  
  suggestionBox: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    marginTop: -5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    zIndex: 9999,
    maxHeight: 1000,
  },
  suggestionItem: {
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
  },
  collapsibleHeader: {
    fontWeight: '700',
    fontSize: 16,
    marginTop: 20,
    marginBottom: 8,
    color: '#6a0dad',
  },

});
