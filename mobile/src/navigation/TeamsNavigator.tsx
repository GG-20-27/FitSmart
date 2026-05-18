import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TeamLandingScreen from '../screens/teams/TeamLandingScreen';
import CreateTeamScreen from '../screens/teams/CreateTeamScreen';
import JoinTeamScreen from '../screens/teams/JoinTeamScreen';
import TeamMainScreen from '../screens/teams/TeamMainScreen';
import { colors } from '../theme';

const Stack = createNativeStackNavigator();

export default function TeamsNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bgPrimary },
      }}
    >
      <Stack.Screen name="TeamLanding" component={TeamLandingScreen} />
      <Stack.Screen name="CreateTeam" component={CreateTeamScreen} />
      <Stack.Screen name="JoinTeam" component={JoinTeamScreen} />
      <Stack.Screen name="TeamMain" component={TeamMainScreen} />
    </Stack.Navigator>
  );
}
