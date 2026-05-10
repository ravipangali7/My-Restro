import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mithobasai/mithobasai_app.dart';

void main() {
  testWidgets('MithobasaiApp builds', (WidgetTester tester) async {
    await tester.pumpWidget(const MithobasaiApp());
    await tester.pump();
    expect(find.byType(MaterialApp), findsOneWidget);
  });
}
