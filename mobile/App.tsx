import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Font from "expo-font";
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from "@expo-google-fonts/inter";
import { IBMPlexSans_600SemiBold, IBMPlexSans_700Bold } from "@expo-google-fonts/ibm-plex-sans";
import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold,
} from "@expo-google-fonts/ibm-plex-mono";

import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { BusinessProfileProvider } from "./src/context/BusinessProfileContext";
import { LoginScreen, RegisterScreen, RecoverPasswordScreen } from "./src/screens/AuthScreens";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { NotificationsScreen } from "./src/screens/NotificationsScreen";
import {
  AddExpenseScreen,
  AddSalesScreen,
  EditRecordScreen,
  FlaggedRecordsScreen,
  ImportCsvScreen,
  RecordsScreen,
  ScanReceiptScreen,
} from "./src/screens/RecordsScreens";
import {
  ExpenseBehaviorScreen,
  RecoveryTargetScreen,
  SpendingImpactScreen,
} from "./src/screens/InsightsScreens";
import {
  BusinessProfileFormScreen,
  BusinessProfilesScreen,
  ProfileScreen,
} from "./src/screens/BusinessScreens";
import { brand, font, ink, paper } from "./src/theme/tokens";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: brand[600],
    background: paper[50],
    card: paper.DEFAULT,
    text: ink[900],
    border: brand[100],
  },
};

const screenOptions = {
  headerStyle: { backgroundColor: paper.DEFAULT },
  headerTitleStyle: { fontFamily: font.display, color: brand[900] },
  headerTintColor: brand[700],
} as const;

/**
 * The Dashboard needs a stack of its own so it can push the alerts list —
 * web reaches the same screen from the bell in its header.
 */
function DashboardStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="DashboardHome" component={DashboardScreen} options={{ title: "Dashboard" }} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: "Alerts" }} />
    </Stack.Navigator>
  );
}

function RecordsStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="RecordsList" component={RecordsScreen} options={{ title: "Records" }} />
      <Stack.Screen name="AddExpense" component={AddExpenseScreen} options={{ title: "Add expense" }} />
      <Stack.Screen name="AddSales" component={AddSalesScreen} options={{ title: "Add sales" }} />
      {/*
        Tapping a record on the list navigates here. This was missing: the
        list has always called navigate("EditRecord"), so every tap resolved
        to nothing and a saved record could not be corrected on mobile at all.
      */}
      <Stack.Screen name="EditRecord" component={EditRecordScreen} options={{ title: "Edit record" }} />
      <Stack.Screen name="ScanReceipt" component={ScanReceiptScreen} options={{ title: "Scan receipt" }} />
      <Stack.Screen name="ImportCsv" component={ImportCsvScreen} options={{ title: "Import CSV" }} />
      <Stack.Screen name="FlaggedRecords" component={FlaggedRecordsScreen} options={{ title: "Review" }} />
    </Stack.Navigator>
  );
}

function InsightsStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="ExpenseBehavior" component={ExpenseBehaviorScreen} options={{ title: "Insights" }} />
      <Stack.Screen name="SpendingImpact" component={SpendingImpactScreen} options={{ title: "Insights" }} />
      <Stack.Screen name="RecoveryTarget" component={RecoveryTargetScreen} options={{ title: "Insights" }} />
    </Stack.Navigator>
  );
}

function BusinessStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="BusinessProfiles" component={BusinessProfilesScreen} options={{ title: "Business" }} />
      <Stack.Screen name="BusinessProfileForm" component={BusinessProfileFormScreen} options={{ title: "Business profile" }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: "My account" }} />
    </Stack.Navigator>
  );
}

/**
 * Bottom tabs, mirroring the web app's own bottom nav exactly — same four
 * destinations, same order, same glyphs (web/src/components/AppShell.tsx
 * NAV_ITEMS). Someone moving between phone and laptop shouldn't have to
 * relearn where anything lives.
 */
function TabIcon({ glyph, color }: { glyph: string; color: string }) {
  return <Text style={{ fontSize: 18, color }}>{glyph}</Text>;
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: brand[700],
        tabBarInactiveTintColor: ink[500],
        tabBarStyle: { backgroundColor: paper.DEFAULT, borderTopColor: brand[100] },
        tabBarLabelStyle: { fontFamily: font.sansMedium, fontSize: 11 },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardStack}
        options={{ tabBarIcon: ({ color }) => <TabIcon glyph="◧" color={color} /> }}
      />
      <Tab.Screen
        name="Records"
        component={RecordsStack}
        options={{ tabBarIcon: ({ color }) => <TabIcon glyph="☰" color={color} /> }}
      />
      <Tab.Screen
        name="Insights"
        component={InsightsStack}
        options={{ tabBarIcon: ({ color }) => <TabIcon glyph="◔" color={color} /> }}
      />
      <Tab.Screen
        name="Business"
        component={BusinessStack}
        options={{ tabBarIcon: ({ color }) => <TabIcon glyph="▣" color={color} /> }}
      />
    </Tab.Navigator>
  );
}

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="RecoverPassword" component={RecoverPasswordScreen} />
    </Stack.Navigator>
  );
}

function Root() {
  const { profile, loading } = useAuth();

  // Restoring the session from the device keystore is async, so the app waits
  // here rather than flashing Login at an already-signed-in user.
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: paper[50] }}>
        <ActivityIndicator color={brand[600]} />
      </View>
    );
  }

  return profile ? (
    <BusinessProfileProvider>
      <MainTabs />
    </BusinessProfileProvider>
  ) : (
    <AuthStack />
  );
}

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Font.loadAsync({
      Inter_400Regular,
      Inter_500Medium,
      Inter_600SemiBold,
      IBMPlexSans_600SemiBold,
      IBMPlexSans_700Bold,
      IBMPlexMono_400Regular,
      IBMPlexMono_500Medium,
      IBMPlexMono_600SemiBold,
    })
      // A font failure must not block the app — React Native falls back to the
      // system face, which looks worse but is entirely usable.
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: paper[50] }}>
        <ActivityIndicator color={brand[600]} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer theme={navTheme}>
        <AuthProvider>
          <Root />
        </AuthProvider>
      </NavigationContainer>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
