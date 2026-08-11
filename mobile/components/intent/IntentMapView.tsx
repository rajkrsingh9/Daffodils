import React from 'react';
import { Text, View } from 'react-native';
import MapView, { Marker, Circle } from 'react-native-maps';
import { ClayButton } from '../shared';
import { colors, radius, shadows, spacing, type, vibe as vibes } from '../../constants/theme';
import type { Intent } from './IntentCard';

export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export interface IntentMapViewProps {
  region: MapRegion | undefined;
  intents: Intent[];
  error: string | null;
  onMarkerPress: (intentId: string) => void;
  onRetryLocation: () => void;
}

/**
 * Native-only map. This file must never be imported on web — react-native-web
 * cannot satisfy react-native-maps' native module registration
 * (codegenNativeComponent throws at import time, not render time). Metro's
 * platform resolution keeps it out of the web bundle entirely: `nearby.tsx`
 * imports `./IntentMapView` with no extension, so web picks up
 * `IntentMapView.web.tsx` instead and this file is never evaluated there.
 */
export function IntentMapView({
  region,
  intents,
  error,
  onMarkerPress,
  onRetryLocation,
}: IntentMapViewProps) {
  if (!region) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.surfaceSunken,
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.md,
          padding: spacing.xl,
        }}
      >
        <Text style={{ fontSize: 36 }}>📍</Text>
        <Text style={[type.bodyMuted, { textAlign: 'center' }]}>
          {error ?? 'Finding your location…'}
        </Text>
        <ClayButton title="Enable location" size="sm" onPress={onRetryLocation} />
      </View>
    );
  }

  return (
    <MapView
      style={{ flex: 1 }}
      initialRegion={region}
      showsUserLocation
      showsMyLocationButton={false}
    >
      {/* Your own visibility radius, for context on who can see you. */}
      <Circle
        center={{ latitude: region.latitude, longitude: region.longitude }}
        radius={5000}
        strokeColor="rgba(255,201,60,0.5)"
        fillColor="rgba(255,201,60,0.10)"
      />
      {intents.map((intent) => (
        <Marker
          key={intent.id}
          coordinate={{ latitude: intent.lat, longitude: intent.lng }}
          onPress={() => onMarkerPress(intent.id)}
          tracksViewChanges={false}
        >
          <View
            style={[
              {
                paddingHorizontal: 10,
                paddingVertical: 7,
                borderRadius: radius.md,
                backgroundColor: colors.surface,
                borderWidth: 2,
                borderColor: vibes[intent.vibeTag]?.color ?? colors.primary,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
              },
              shadows.claySm,
            ]}
          >
            <Text style={{ fontSize: 15 }}>{intent.activityEmoji}</Text>
            <Text style={{ fontSize: 11, fontWeight: '800', color: colors.text }}>
              {intent.distanceLabel ?? ''}
            </Text>
          </View>
        </Marker>
      ))}
    </MapView>
  );
}

export default IntentMapView;
