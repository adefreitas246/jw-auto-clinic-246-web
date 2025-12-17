// import { Dimensions, StyleSheet, Text, View } from 'react-native';
// import { LineChart } from 'react-native-chart-kit';

// export default function ReportsScreen() {
//   const screenWidth = Dimensions.get('window').width - 40;

//   return (
//     <View style={styles.container}>
//       {/* Earnings Summary */}
//       <View style={styles.summaryRow}>
//         <View style={styles.card}>
//           <Text style={styles.label}>Total Earned Today</Text>
//           <Text style={styles.amount}>$450.90</Text>
//           <Text style={styles.percent}>+20% month over month</Text>
//         </View>
//         <View style={styles.card}>
//           <Text style={styles.label}>Total Earned Yesterday</Text>
//           <Text style={styles.amount}>$485.00</Text>
//           <Text style={styles.percent}>+33% month over month</Text>
//         </View>
//       </View>

//       {/* Earnings Line Chart */}
//       <View style={styles.chartWrapper}>
//         <Text style={styles.chartTitle}>Earnings</Text>
//         <LineChart
//           data={{
//             labels: ['Nov 23', '24', '25', '26', '27', '28', '29', '30'],
//             datasets: [
//               {
//                 data: [30000, 32000, 34000, 36000, 37000, 39000, 43000, 50000],
//               },
//             ],
//           }}
//           width={screenWidth}
//           height={220}
//           yAxisLabel="$"
//           yAxisSuffix="K"
//           yAxisInterval={1}
//           chartConfig={{
//             backgroundGradientFrom: '#fff',
//             backgroundGradientTo: '#fff',
//             decimalPlaces: 0,
//             color: (opacity = 1) => `rgba(106, 13, 173, ${opacity})`,
//             labelColor: () => '#555',
//             propsForDots: {
//               r: '5',
//               strokeWidth: '2',
//               stroke: '#6a0dad',
//             },
//           }}
//           bezier
//           style={{
//             marginVertical: 12,
//             borderRadius: 10,
//           }}
//         />
//       </View>
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   container: { flex: 1, padding: 20, backgroundColor: '#fff' },
//   summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
//   card: {
//     flex: 1,
//     backgroundColor: '#fafafa',
//     borderRadius: 12,
//     padding: 16,
//   },
//   label: { fontSize: 13, color: '#555' },
//   amount: { fontSize: 22, fontWeight: 'bold', color: '#6a0dad', marginVertical: 4 },
//   percent: { fontSize: 12, color: '#888' },
//   chartWrapper: { backgroundColor: '#fafafa', borderRadius: 12, padding: 16 },
//   chartTitle: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
// });
