// // @/components/CompatModal.tsx
// import React from "react";
// import {
//     InteractionManager,
//     Modal,
//     ModalProps,
//     Platform,
//     Pressable,
//     StyleSheet,
//     View,
// } from "react-native";

// type Props = {
//   // Accept BOTH (parity with react-native-modal & RN Modal)
//   isVisible?: boolean;
//   visible?: boolean;

//   // Layout
//   position?: "center" | "bottom";

//   // Backdrop
//   backdropOpacity?: number;         // default 0.25
//   backdropColor?: string;           // default 'black'
//   onBackdropPress?: () => void;

//   // Close (Android back / programmatic close)
//   onRequestClose?: () => void;

//   // Pass-through / animation parity
//   animationInOut?: "fade" | "slide";                 // ← parity flag
//   animationType?: ModalProps["animationType"];       // default 'slide'
//   transparent?: boolean;                             // default true
//   presentationStyle?: ModalProps["presentationStyle"];
//   statusBarTranslucent?: boolean;
//   supportedOrientations?: ModalProps["supportedOrientations"];
//   hardwareAccelerated?: boolean;

//   // Events
//   onShow?: ModalProps["onShow"];
//   onDismiss?: ModalProps["onDismiss"];
//   onCloseComplete?: () => void;                      // ← NEW

//   children?: React.ReactNode;
// };

// export default function CompatModal({
//   isVisible,
//   visible,
//   position = "center",
//   backdropOpacity = 0.25,
//   backdropColor = "black",
//   onBackdropPress,
//   onRequestClose,

//   // RN Modal props (defaults set to satisfy your request)
//   animationInOut = "fade",
//   animationType = "slide",
//   transparent = true,
//   presentationStyle,
//   statusBarTranslucent = Platform.OS !== "web",
//   supportedOrientations = ["portrait", "landscape"],
//   hardwareAccelerated = true,

//   // Events
//   onShow,
//   onDismiss,
//   onCloseComplete,

//   children,
// }: Props) {
//   const show = (isVisible ?? visible) ?? false;

//   // Map animationInOut ("fade" | "slide") to native animationType if not explicitly set
//   const resolvedAnimationType: ModalProps["animationType"] =
//     animationType ?? (animationInOut === "fade" ? "fade" : "slide");

//   return (
//     <Modal
//       transparent={transparent}
//       visible={!!show}
//       onRequestClose={onRequestClose}
//       animationType={resolvedAnimationType}
//       presentationStyle={
//         Platform.OS === "ios"
//           ? (presentationStyle ?? "overFullScreen")
//           : presentationStyle
//       }
//       statusBarTranslucent={statusBarTranslucent}
//       supportedOrientations={supportedOrientations}
//       hardwareAccelerated={hardwareAccelerated}
//       onShow={onShow}
//       onDismiss={() => {
//         onDismiss?.();
//         if (onCloseComplete) {
//           InteractionManager.runAfterInteractions(() => { try { onCloseComplete(); } catch {} });
//         }
//       }}
//     >
//       <View style={styles.fill} pointerEvents="box-none" accessibilityViewIsModal>
//         {/* Dimmed backdrop */}
//         <View
//             style={[
//                 styles.fill,
//                 { backgroundColor: backdropColor, opacity: backdropOpacity },
//             ]}
//         />
//         {/* Click-away */}
//         <Pressable style={StyleSheet.absoluteFill} onPress={onBackdropPress} />

//         {/* Content container */}
//         <View
//           style={[
//             styles.fill,
//             position === "bottom" ? styles.atBottom : styles.atCenter,
//           ]}
//           pointerEvents="box-none"
//         >
//           <View style={{ alignSelf: position === "bottom" ? "stretch" : "auto" }}>
//             {children}
//           </View>
//         </View>
//       </View>
//     </Modal>
//   );
// }

// const styles = StyleSheet.create({
//   fill: { ...StyleSheet.absoluteFillObject },
//   atCenter: { justifyContent: "center", alignItems: "center" },
//   atBottom: { justifyContent: "flex-end" },
// });
