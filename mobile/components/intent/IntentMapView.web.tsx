import React from 'react';
import { Text, View } from 'react-native';
import { colors, spacing, type } from '../../constants/theme';
import type { IntentMapViewProps } from './IntentMapView';

/**
 * Web fallback. react-native-maps has no web implementation — nearby.tsx
 * already keeps `view` pinned to 'list' on web so this rarely mounts, but it
 * stays safe to render on its own rather than crashing if it ever does.
 */
export function IntentMapView(_props: IntentMapViewProps) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.surfaceSunken,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        padding: spacing.xl,
      }}
    >
      <Text style={{ fontSize: 32 }}>🗺</Text>
      <Text style={[type.bodyMuted, { textAlign: 'center' }]}>
        Map view isn't available in the browser — use the list view instead.
      </Text>
    </View>
  );
}

export default IntentMapView;
