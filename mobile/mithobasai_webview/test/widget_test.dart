import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mithobasai_webview/main.dart';

void main() {
  testWidgets('MaterialApp builds', (WidgetTester tester) async {
    await tester.pumpWidget(const MithobasaiApp());
    await tester.pump();
    expect(find.byType(MaterialApp), findsOneWidget);
  });
}
