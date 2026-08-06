import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as Font from "expo-font";
import * as SplashScreen from "expo-splash-screen";
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
import { MoreScreen } from "./src/screens/MoreScreen";
import {
  AddExpenseScreen,
  AddSalesScreen,
  EditRecordScreen,
  FlaggedRecordsScreen,
  ImportCsvScreen,
  RecordsScreen,
  ScanReceiptScreen,
} from "./src/screens/RecordsScreens";
import { CategoriesScreen } from "./src/screens/CategoriesScreen";
import {
  ContactScreen,
  FaqsScreen,
  PrivacyScreen,
  TermsScreen,
  TutorialsScreen,
} from "./src/screens/HelpScreens";
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

/*
 * Hold the native splash until the app actually has something to show.
 *
 * The splash was configured in app.config.ts but never held: it hid itself the
 * moment the JS bundle loaded, and the owner then watched a bare spinner while
 * the fonts loaded and a second one while the session was restored. Holding it
 * to the end of both makes the cold start read as splash → app.
 *
 * Called in global scope and not awaited, per the module's own guidance — from
 * inside a component or an effect this can run after the splash is already
 * gone. Its rejection is swallowed because a splash that will not stay up is
 * a cosmetic problem, not a reason to fail to start.
 */
SplashScreen.preventAutoHideAsync().catch(() => undefined);

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
      {/*
        headerShown: false — DashboardScreen (now Home) builds its own header
        with an avatar, a business switcher and a bell, which replaces both
        this native title bar and the eyebrow/title ScreenHeader every other
        screen uses. Same pattern MoreStack already uses for MoreHome.
      */}
      <Stack.Screen name="DashboardHome" component={DashboardScreen} options={{ headerShown: false }} />
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
      {/*
        In the Records stack rather than under More, because a category is a
        records concept — the screen's own "view records" route goes straight
        back to RecordsList, which only works without a stack hop from here.
      */}
      <Stack.Screen name="Categories" component={CategoriesScreen} options={{ title: "Categories" }} />
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

/**
 * Everything that is not a daily task, behind one tab.
 *
 * "Business" previously held a whole bottom-bar slot, putting profile
 * settings — a once-a-month errand — at the same level as recording an
 * expense. Alerts lives here too, so it is reachable without going via the
 * Dashboard.
 */
function MoreStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="MoreHome" component={MoreScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: "My account" }} />
      <Stack.Screen name="BusinessProfiles" component={BusinessProfilesScreen} options={{ title: "Businesses" }} />
      <Stack.Screen name="BusinessProfileForm" component={BusinessProfileFormScreen} options={{ title: "Business profile" }} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: "Alerts" }} />
      {/*
        Help and legal live IN the app, not behind a link to the website.
        Most owners have a phone and no computer, so for them this is the only
        place these documents will ever be read — and Privacy and Terms are
        not optional reading to route someone off-device for.
      */}
      <Stack.Screen name="Faqs" component={FaqsScreen} options={{ title: "Questions" }} />
      <Stack.Screen name="Tutorials" component={TutorialsScreen} options={{ title: "Tutorials" }} />
      <Stack.Screen name="Contact" component={ContactScreen} options={{ title: "Contact us" }} />
      <Stack.Screen name="Privacy" component={PrivacyScreen} options={{ title: "Privacy" }} />
      <Stack.Screen name="Terms" component={TermsScreen} options={{ title: "Terms of use" }} />
    </Stack.Navigator>
  );
}

/**
 * Bottom tabs.
 *
 * Three places work happens, then everything else. The icons are a real icon
 * set rather than the Unicode geometric shapes (◧ ☰ ◔ ▣) that stood in
 * before — those rendered differently on every device and read as
 * placeholders, because that is what they were.
 *
 * Outline when inactive, filled when active: the selected tab is the only one
 * carrying weight, which is a second signal beyond the tint for anyone who
 * cannot separate the two colours.
 */
const TAB_ICONS: Record<string, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]> = {
  Dashboard: ["home-outline", "home"],
  Records: ["receipt-outline", "receipt"],
  Insights: ["bar-chart-outline", "bar-chart"],
  More: ["ellipsis-horizontal-circle-outline", "ellipsis-horizontal-circle"],
};

/**
 * Scanning a receipt, given the middle of the bar.
 *
 * It is the thing this app is FOR and the reason someone opens it standing
 * at a counter, so it gets the easiest target on the screen rather than
 * being a button on a screen two taps away.
 *
 * Raised out of the bar and drawn as a filled circle, so it reads as an
 * action rather than a fifth destination — it does not navigate to a tab and
 * never shows a selected state.
 */
function ScanTabButton({ onPress }: { onPress: () => void }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "flex-start" }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Scan a receipt"
        style={({ pressed }) => ({
          width: 54,
          height: 54,
          borderRadius: 27,
          marginTop: -20,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: pressed ? brand[800] : brand[700],
          // A ring in the bar's own colour so the circle reads as sitting
          // above the bar rather than punched through it.
          borderWidth: 4,
          borderColor: paper.DEFAULT,
          shadowColor: ink[900],
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.18,
          shadowRadius: 5,
          elevation: 5,
        })}
      >
        <Ionicons name="scan" size={24} color="#fff" />
      </Pressable>
    </View>
  );
}

function MainTabs() {
  /*
   * The phone's own navigation bar sits under ours.
   *
   * React Navigation adds the bottom inset for you — but only while you leave
   * the tab bar's height alone. Setting a fixed height (which this did) throws
   * that away, and on a device with gesture or button navigation the labels end
   * up behind the system bar. The inset is added back explicitly here rather
   * than dropping the height, because the taller bar is what gives the raised
   * scan button room.
   */
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: brand[700],
        tabBarInactiveTintColor: ink[500],
        tabBarStyle: {
          backgroundColor: paper.DEFAULT,
          borderTopColor: paper[200],
          height: 60 + insets.bottom,
          paddingTop: 6,
          paddingBottom: 8 + insets.bottom,
        },
        tabBarLabelStyle: { fontFamily: font.sansMedium, fontSize: 11 },
        tabBarIcon: ({ color, focused }) => {
          const pair = TAB_ICONS[route.name];
          return <Ionicons name={pair ? pair[focused ? 1 : 0] : "ellipse-outline"} size={22} color={color} />;
        },
      })}
    >
      {/*
        Route name stays "Dashboard" — nothing navigates to it by name, and
        renaming it would be pure churn — but the visible label is "Home",
        which is what the tab actually is now.
      */}
      <Tab.Screen name="Dashboard" component={DashboardStack} options={{ tabBarLabel: "Home" }} />
      <Tab.Screen name="Records" component={RecordsStack} />
      {/*
        A tab in position only. The screen is never rendered: the press is
        intercepted below and turned into a push onto the Records stack, so
        Scan behaves like an action and leaves the owner somewhere they can
        navigate back from.
      */}
      <Tab.Screen
        name="Scan"
        component={ScanPlaceholder}
        options={{
          tabBarLabel: "",
          tabBarButton: (props) => (
            <ScanTabButton
              onPress={() => props.onPress?.({} as never)}
            />
          ),
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            // autoLaunch opens the camera immediately — the button IS the
            // scan action, so landing on a screen that still needs a "Take a
            // photo" tap would make it a shortcut to the shortcut.
            navigation.navigate("Records", { screen: "ScanReceipt", params: { autoLaunch: true } });
          },
        })}
      />
      <Tab.Screen name="Insights" component={InsightsStack} />
      <Tab.Screen name="More" component={MoreStack} />
    </Tab.Navigator>
  );
}

/** Never rendered — the Scan tab's press is intercepted before it mounts. */
function ScanPlaceholder() {
  return null;
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

function Root({ fontsReady }: { fontsReady: boolean }) {
  const { profile, loading } = useAuth();

  // Restoring the session from the device keystore is async, so the app waits
  // here rather than flashing Login at an already-signed-in user. Fonts are
  // waited on in the same place because the two finish independently and
  // there is nothing worth showing until both have.
  const ready = fontsReady && !loading;

  useEffect(() => {
    // Uncovering the app is the last thing that happens, after the tree that
    // replaces the splash has been committed. hideAsync's rejection is
    // ignored for the same reason preventAutoHideAsync's is.
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  if (!ready) {
    // Normally invisible — the native splash is still up. This is what the
    // owner sees if the splash could not be held, so it stays a real view
    // rather than null.
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
  const [fontsReady, setFontsReady] = useState(false);

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
      .finally(() => setFontsReady(true));
  }, []);

  /*
   * The providers mount immediately, before the fonts are in.
   *
   * This used to return early while loading fonts, which meant AuthProvider
   * did not exist yet and the session was not read from the keystore until
   * the eighth typeface had landed — two waits, one after the other, for two
   * jobs that have nothing to do with each other. Root holds the screen back
   * until both are done, so nothing renders early; they just now overlap.
   */
  return (
    // GestureHandlerRootView must be the OUTERMOST view, above the navigation
    // container. Swipeable record rows do nothing at all on Android without
    // it — and fail silently rather than erroring, which is the worst way for
    // a gesture to be broken.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer theme={navTheme}>
          <AuthProvider>
            <Root fontsReady={fontsReady} />
          </AuthProvider>
        </NavigationContainer>
        <StatusBar style="dark" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
